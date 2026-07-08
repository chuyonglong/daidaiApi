package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelKeyScriptTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db := setupChannelBatchCreateTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.ChannelKeyScript{}, &model.Log{}))
	return db
}

func TestExtractChannelKeyScriptKeysFindsSkKeysAndDeduplicates(t *testing.T) {
	keys := extractChannelKeyScriptKeys("log sk-alpha_123 more\nstderr sk-beta-456\nsk-alpha_123")

	require.Equal(t, []string{"sk-alpha_123", "sk-beta-456"}, keys)
}

func TestMergeChannelKeyScriptKeysAppendsOnlyNewKeys(t *testing.T) {
	merged := mergeChannelKeyScriptKeys("sk-old\n sk-same \n", []string{"sk-new", "sk-same", "sk-newer"})

	require.Equal(t, "1:sk-old\n2:sk-same\n3:sk-new\n4:sk-newer", merged)
}

func TestBuildChannelKeyPythonEnvForcesUtf8AndReplacesExistingValues(t *testing.T) {
	env := buildChannelKeyPythonEnv([]string{
		"PATH=C:\\Python",
		"PYTHONIOENCODING=gbk",
		"pythonutf8=0",
		"OTHER=value",
	})

	require.Contains(t, env, "PATH=C:\\Python")
	require.Contains(t, env, "OTHER=value")
	require.Contains(t, env, "PYTHONIOENCODING=utf-8")
	require.Contains(t, env, "PYTHONUTF8=1")
	require.NotContains(t, env, "PYTHONIOENCODING=gbk")
	require.NotContains(t, env, "pythonutf8=0")
	require.Equal(t, 1, countEnvKeys(env, "PYTHONIOENCODING"))
	require.Equal(t, 1, countEnvKeys(env, "PYTHONUTF8"))
}

func TestRunChannelKeyPythonScriptUsesUtf8ForUnicodeOutput(t *testing.T) {
	if _, err := exec.LookPath("python"); err != nil {
		t.Skip("python executable is not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	output, isTrimmed, err := runChannelKeyPythonScript(ctx, "print('✅ 中文 sk-unicode-123')")

	require.NoError(t, err, output)
	require.False(t, isTrimmed)
	require.Contains(t, output, "✅ 中文 sk-unicode-123")
	require.Equal(t, []string{"sk-unicode-123"}, extractChannelKeyScriptKeys(output))
}

func countEnvKeys(env []string, key string) int {
	count := 0
	prefix := strings.ToUpper(key) + "="
	for _, item := range env {
		if strings.HasPrefix(strings.ToUpper(item), prefix) {
			count++
		}
	}
	return count
}

func TestBackfillChannelKeyScriptRejectsSingleKeyChannel(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "single",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "sk-old",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
	}
	require.NoError(t, db.Create(&channel).Error)

	result, err := backfillChannelKeyScriptKeys(channel.Id, "sk-old\nsk-new")

	require.Error(t, err)
	require.Contains(t, err.Error(), "multi-key")
	require.Nil(t, result)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, "sk-old", stored.Key)
}

func TestBackfillChannelKeyScriptUpdatesMultiKeyChannel(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "multi",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "sk-old\nsk-disabled",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:             true,
			MultiKeySize:           2,
			MultiKeyMode:           constant.MultiKeyModePolling,
			MultiKeyStatusList:     map[int]int{1: common.ChannelStatusAutoDisabled, 5: common.ChannelStatusAutoDisabled},
			MultiKeyDisabledReason: map[int]string{1: "bad", 5: "old"},
			MultiKeyDisabledTime:   map[int]int64{1: 100, 5: 500},
			MultiKeyPollingIndex:   1,
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	result, err := backfillChannelKeyScriptKeys(channel.Id, "sk-old\n\nsk-new\nsk-disabled")

	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "1:sk-old\n2:sk-new\n3:sk-disabled", result.Key)
	require.Equal(t, 3, result.ChannelInfo.MultiKeySize)
	require.Equal(t, constant.MultiKeyModePolling, result.ChannelInfo.MultiKeyMode)
	require.Equal(t, map[int]int{2: common.ChannelStatusAutoDisabled}, result.ChannelInfo.MultiKeyStatusList)
	require.Equal(t, map[int]string{2: "bad"}, result.ChannelInfo.MultiKeyDisabledReason)
	require.Equal(t, map[int]int64{2: 100}, result.ChannelInfo.MultiKeyDisabledTime)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, "1:sk-old\n2:sk-new\n3:sk-disabled", stored.Key)
	require.Equal(t, 3, stored.ChannelInfo.MultiKeySize)
}

func TestBackfillChannelKeyScriptRemapsRemarks(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "multi",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "sk-old\nsk-mid\nsk-extra",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:      true,
			MultiKeySize:    3,
			MultiKeyMode:    constant.MultiKeyModeRandom,
			MultiKeyRemarks: map[int]string{0: "old", 2: "extra"},
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	result, err := backfillChannelKeyScriptKeys(channel.Id, "sk-new\nsk-extra\nsk-old")

	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, map[int]string{1: "extra", 2: "old"}, result.ChannelInfo.MultiKeyRemarks)
}

func TestExecuteChannelKeyScriptReturnsMergedKeys(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "multi",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "sk-old",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:   true,
			MultiKeySize: 1,
			MultiKeyMode: constant.MultiKeyModeRandom,
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/1/key_script/execute", map[string]string{
		"script": "print('new key sk-new-123 and duplicate sk-old')",
	}, 1)
	ctx.Params = append(ctx.Params, gin.Param{Key: "id", Value: strconv.Itoa(channel.Id)})

	ExecuteChannelKeyScript(ctx)

	var response struct {
		Success bool            `json:"success"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success, response.Message)

	var data channelKeyScriptExecuteResponse
	require.NoError(t, common.Unmarshal(response.Data, &data))
	require.Equal(t, []string{"sk-new-123", "sk-old"}, data.Keys)
	require.Equal(t, "1:sk-old\n2:sk-new-123", data.MergedKey)
	require.True(t, data.IsMultiKey)
}

func TestManageMultiKeysReturnsInvalidKeyErrorSummary(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "multi",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-bad\n2:sk-good",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:             true,
			MultiKeySize:           2,
			MultiKeyMode:           constant.MultiKeyModeRandom,
			MultiKeyStatusList:     map[int]int{0: common.ChannelStatusAutoDisabled},
			MultiKeyDisabledReason: map[int]string{0: "status_code=401, invalid api key"},
			MultiKeyDisabledTime:   map[int]int64{0: 100},
			MultiKeyErrorStatus:    map[int]int{0: http.StatusUnauthorized},
			MultiKeyErrorCode:      map[int]string{0: "invalid_api_key"},
			MultiKeyErrorReason:    map[int]string{0: "认证失败"},
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "get_key_status",
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Keys []struct {
				Index       int    `json:"index"`
				KeyNo       int    `json:"key_no"`
				ErrorStatus int    `json:"error_status"`
				ErrorCode   string `json:"error_code"`
				ErrorReason string `json:"error_reason"`
			} `json:"keys"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Keys, 2)
	require.Equal(t, 0, response.Data.Keys[0].Index)
	require.Equal(t, 1, response.Data.Keys[0].KeyNo)
	require.Equal(t, http.StatusUnauthorized, response.Data.Keys[0].ErrorStatus)
	require.Equal(t, "invalid_api_key", response.Data.Keys[0].ErrorCode)
	require.Equal(t, "认证失败", response.Data.Keys[0].ErrorReason)
}

func TestManageMultiKeysShowsCodexAccountIDAsKeyPreview(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "codex multi",
		Type:   constant.ChannelTypeCodex,
		Key:    `1:{"access_token":"at-one","account_id":"acct-one"}` + "\n" + `2:{"access_token":"at-two","account_id":"acct-two"}`,
		Models: "gpt-5-codex",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:   true,
			MultiKeySize: 2,
			MultiKeyMode: constant.MultiKeyModeRandom,
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "get_key_status",
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Keys []struct {
				KeyPreview string `json:"key_preview"`
			} `json:"keys"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Keys, 2)
	require.Equal(t, "acct-one", response.Data.Keys[0].KeyPreview)
	require.Equal(t, "acct-two", response.Data.Keys[1].KeyPreview)
}

func TestManageMultiKeysFallsBackToMaskedPreviewForInvalidCodexKeyJSON(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "codex invalid multi",
		Type:   constant.ChannelTypeCodex,
		Key:    "1:not-json-value",
		Models: "gpt-5-codex",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:   true,
			MultiKeySize: 1,
			MultiKeyMode: constant.MultiKeyModeRandom,
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "get_key_status",
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Keys []struct {
				KeyPreview string `json:"key_preview"`
			} `json:"keys"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Keys, 1)
	require.Equal(t, "not-json-v...", response.Data.Keys[0].KeyPreview)
}

func TestManageMultiKeysDerivesErrorCodeFromDisabledReason(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "multi",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-existing\n2:sk-derived",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:             true,
			MultiKeySize:           2,
			MultiKeyMode:           constant.MultiKeyModeRandom,
			MultiKeyStatusList:     map[int]int{0: common.ChannelStatusAutoDisabled, 1: common.ChannelStatusAutoDisabled},
			MultiKeyDisabledReason: map[int]string{0: "status_code=403, existing should not be overwritten", 1: "status_code=403, user quota exhausted"},
			MultiKeyErrorCode:      map[int]string{0: "provider_forbidden"},
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "get_key_status",
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Keys []struct {
				Index     int    `json:"index"`
				ErrorCode string `json:"error_code"`
			} `json:"keys"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Keys, 2)
	require.Equal(t, 0, response.Data.Keys[0].Index)
	require.Equal(t, "provider_forbidden", response.Data.Keys[0].ErrorCode)
	require.Equal(t, 1, response.Data.Keys[1].Index)
	require.Equal(t, "403", response.Data.Keys[1].ErrorCode)
}

func TestManageMultiKeysEnablesOnlyCurrentChannelAutoDisabledKeys(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:      "target",
		Type:      constant.ChannelTypeOpenAI,
		Key:       "1:sk-enabled\n2:sk-auto-a\n3:sk-manual\n4:sk-auto-b",
		Models:    "gpt-4o",
		Status:    common.ChannelStatusAutoDisabled,
		OtherInfo: `{"status_reason":"All keys are disabled","status_time":123}`,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:             true,
			MultiKeySize:           4,
			MultiKeyMode:           constant.MultiKeyModeRandom,
			MultiKeyStatusList:     map[int]int{1: common.ChannelStatusAutoDisabled, 2: common.ChannelStatusManuallyDisabled, 3: common.ChannelStatusAutoDisabled},
			MultiKeyDisabledReason: map[int]string{1: "quota exhausted", 2: "manual", 3: "quota exhausted"},
			MultiKeyDisabledTime:   map[int]int64{1: 100, 2: 200, 3: 300},
			MultiKeyErrorStatus:    map[int]int{1: http.StatusForbidden, 3: http.StatusTooManyRequests},
			MultiKeyErrorCode:      map[int]string{1: "insufficient_quota", 3: "rate_limit"},
			MultiKeyErrorReason:    map[int]string{1: "quota", 3: "rate limit"},
		},
	}
	otherChannel := model.Channel{
		Name:   "other",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-other-auto",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:             true,
			MultiKeySize:           1,
			MultiKeyMode:           constant.MultiKeyModeRandom,
			MultiKeyStatusList:     map[int]int{0: common.ChannelStatusAutoDisabled},
			MultiKeyDisabledReason: map[int]string{0: "other quota"},
			MultiKeyDisabledTime:   map[int]int64{0: 400},
			MultiKeyErrorStatus:    map[int]int{0: http.StatusForbidden},
			MultiKeyErrorCode:      map[int]string{0: "insufficient_quota"},
			MultiKeyErrorReason:    map[int]string{0: "quota"},
		},
	}
	require.NoError(t, db.Create(&channel).Error)
	require.NoError(t, db.Create(&otherChannel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "enable_auto_disabled_keys",
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    int    `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success, response.Message)
	require.Equal(t, 2, response.Data)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, common.ChannelStatusEnabled, stored.Status)
	require.Equal(t, map[int]int{2: common.ChannelStatusManuallyDisabled}, stored.ChannelInfo.MultiKeyStatusList)
	require.Equal(t, map[int]string{2: "manual"}, stored.ChannelInfo.MultiKeyDisabledReason)
	require.Equal(t, map[int]int64{2: 200}, stored.ChannelInfo.MultiKeyDisabledTime)
	require.Empty(t, stored.ChannelInfo.MultiKeyErrorStatus)
	require.Empty(t, stored.ChannelInfo.MultiKeyErrorCode)
	require.Empty(t, stored.ChannelInfo.MultiKeyErrorReason)
	require.NotContains(t, stored.GetOtherInfo(), "status_reason")
	require.NotContains(t, stored.GetOtherInfo(), "status_time")

	var otherStored model.Channel
	require.NoError(t, db.First(&otherStored, otherChannel.Id).Error)
	require.Equal(t, map[int]int{0: common.ChannelStatusAutoDisabled}, otherStored.ChannelInfo.MultiKeyStatusList)
	require.Equal(t, map[int]string{0: "other quota"}, otherStored.ChannelInfo.MultiKeyDisabledReason)
	require.Equal(t, map[int]int64{0: 400}, otherStored.ChannelInfo.MultiKeyDisabledTime)
	require.Equal(t, map[int]int{0: http.StatusForbidden}, otherStored.ChannelInfo.MultiKeyErrorStatus)
	require.Equal(t, map[int]string{0: "insufficient_quota"}, otherStored.ChannelInfo.MultiKeyErrorCode)
	require.Equal(t, map[int]string{0: "quota"}, otherStored.ChannelInfo.MultiKeyErrorReason)
}

func TestManageMultiKeysEnablesSingleAutoDisabledKey(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:      "target",
		Type:      constant.ChannelTypeOpenAI,
		Key:       "1:sk-enabled\n2:sk-auto\n3:sk-manual",
		Models:    "gpt-4o",
		Status:    common.ChannelStatusAutoDisabled,
		OtherInfo: `{"status_reason":"All keys are disabled","status_time":123}`,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:             true,
			MultiKeySize:           3,
			MultiKeyMode:           constant.MultiKeyModeRandom,
			MultiKeyStatusList:     map[int]int{1: common.ChannelStatusAutoDisabled, 2: common.ChannelStatusManuallyDisabled},
			MultiKeyDisabledReason: map[int]string{1: "quota exhausted", 2: "manual"},
			MultiKeyDisabledTime:   map[int]int64{1: 100, 2: 200},
			MultiKeyErrorStatus:    map[int]int{1: http.StatusForbidden},
			MultiKeyErrorCode:      map[int]string{1: "insufficient_quota"},
			MultiKeyErrorReason:    map[int]string{1: "quota"},
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "enable_auto_disabled_key",
		"key_index":  1,
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    int    `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success, response.Message)
	require.Equal(t, 1, response.Data)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, common.ChannelStatusEnabled, stored.Status)
	require.Equal(t, map[int]int{2: common.ChannelStatusManuallyDisabled}, stored.ChannelInfo.MultiKeyStatusList)
	require.Equal(t, map[int]string{2: "manual"}, stored.ChannelInfo.MultiKeyDisabledReason)
	require.Equal(t, map[int]int64{2: 200}, stored.ChannelInfo.MultiKeyDisabledTime)
	require.Empty(t, stored.ChannelInfo.MultiKeyErrorStatus)
	require.Empty(t, stored.ChannelInfo.MultiKeyErrorCode)
	require.Empty(t, stored.ChannelInfo.MultiKeyErrorReason)
	require.NotContains(t, stored.GetOtherInfo(), "status_reason")
	require.NotContains(t, stored.GetOtherInfo(), "status_time")
}

func TestManageMultiKeysAggregatesUsageByMultiKeyIndexAndTimeRange(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "usage",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-a\n2:sk-b\n3:sk-c",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:   true,
			MultiKeySize: 3,
			MultiKeyMode: constant.MultiKeyModeRandom,
		},
	}
	require.NoError(t, db.Create(&channel).Error)
	logs := []model.Log{
		{
			CreatedAt:        100,
			Type:             model.LogTypeConsume,
			ChannelId:        channel.Id,
			Quota:            10,
			PromptTokens:     3,
			CompletionTokens: 7,
			Other:            `{"admin_info":{"is_multi_key":true,"multi_key_index":0}}`,
		},
		{
			CreatedAt:        120,
			Type:             model.LogTypeConsume,
			ChannelId:        channel.Id,
			Quota:            20,
			PromptTokens:     8,
			CompletionTokens: 12,
			Other:            `{"admin_info":{"is_multi_key":true,"multi_key_index":1}}`,
		},
		{
			CreatedAt:        140,
			Type:             model.LogTypeConsume,
			ChannelId:        channel.Id,
			Quota:            30,
			PromptTokens:     13,
			CompletionTokens: 17,
			Other:            `{"admin_info":{"is_multi_key":true,"multi_key_index":1}}`,
		},
		{
			CreatedAt: 120,
			Type:      model.LogTypeError,
			ChannelId: channel.Id,
			Quota:     999,
			Other:     `{"admin_info":{"is_multi_key":true,"multi_key_index":1}}`,
		},
		{
			CreatedAt: 120,
			Type:      model.LogTypeConsume,
			ChannelId: channel.Id + 100,
			Quota:     999,
			Other:     `{"admin_info":{"is_multi_key":true,"multi_key_index":1}}`,
		},
	}
	require.NoError(t, db.Create(&logs).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id":      channel.Id,
		"action":          "get_key_status",
		"include_usage":   true,
		"start_timestamp": 110,
		"end_timestamp":   130,
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Keys []struct {
				Index            int `json:"index"`
				UsedQuota        int `json:"used_quota"`
				RequestCount     int `json:"request_count"`
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
			} `json:"keys"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Keys, 3)
	require.Equal(t, 0, response.Data.Keys[0].UsedQuota)
	require.Equal(t, 0, response.Data.Keys[0].RequestCount)
	require.Equal(t, 20, response.Data.Keys[1].UsedQuota)
	require.Equal(t, 1, response.Data.Keys[1].RequestCount)
	require.Equal(t, 8, response.Data.Keys[1].PromptTokens)
	require.Equal(t, 12, response.Data.Keys[1].CompletionTokens)
	require.Equal(t, 0, response.Data.Keys[2].UsedQuota)
}

func TestManageMultiKeysReturnsAndUpdatesKeyRemark(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "remarks",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-a\n2:sk-b",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:      true,
			MultiKeySize:    2,
			MultiKeyMode:    constant.MultiKeyModeRandom,
			MultiKeyRemarks: map[int]string{1: "backup account"},
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "get_key_status",
	}, 1)

	ManageMultiKeys(ctx)

	var statusResponse struct {
		Success bool `json:"success"`
		Data    struct {
			Keys []struct {
				Index  int    `json:"index"`
				Remark string `json:"remark"`
			} `json:"keys"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &statusResponse))
	require.True(t, statusResponse.Success)
	require.Len(t, statusResponse.Data.Keys, 2)
	require.Equal(t, "", statusResponse.Data.Keys[0].Remark)
	require.Equal(t, "backup account", statusResponse.Data.Keys[1].Remark)

	ctx, recorder = newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "update_key_remark",
		"key_index":  0,
		"remark":     " primary account ",
	}, 1)

	ManageMultiKeys(ctx)

	var updateResponse struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &updateResponse))
	require.True(t, updateResponse.Success, updateResponse.Message)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, map[int]string{0: "primary account", 1: "backup account"}, stored.ChannelInfo.MultiKeyRemarks)

	ctx, recorder = newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "update_key_remark",
		"key_index":  1,
		"remark":     " ",
	}, 1)

	ManageMultiKeys(ctx)

	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &updateResponse))
	require.True(t, updateResponse.Success, updateResponse.Message)
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, map[int]string{0: "primary account"}, stored.ChannelInfo.MultiKeyRemarks)
}

func TestManageMultiKeysRejectsTooLongRemark(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "remark-limit",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-a",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:      true,
			MultiKeySize:    1,
			MultiKeyMode:    constant.MultiKeyModeRandom,
			MultiKeyRemarks: map[int]string{0: "existing"},
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "update_key_remark",
		"key_index":  0,
		"remark":     strings.Repeat("a", 256),
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.False(t, response.Success)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, map[int]string{0: "existing"}, stored.ChannelInfo.MultiKeyRemarks)
}

func TestManageMultiKeysDeleteKeyRemapsRemarks(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "remark-delete",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-a\n2:sk-b\n3:sk-c",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:      true,
			MultiKeySize:    3,
			MultiKeyMode:    constant.MultiKeyModeRandom,
			MultiKeyRemarks: map[int]string{0: "first", 1: "second", 2: "third"},
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "delete_key",
		"key_index":  1,
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success, response.Message)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, "1:sk-a\n2:sk-c", stored.Key)
	require.Equal(t, map[int]string{0: "first", 1: "third"}, stored.ChannelInfo.MultiKeyRemarks)
}

func TestSelectMultiKeyForTestUsesRequestedKeyIndex(t *testing.T) {
	channel := &model.Channel{
		Id:     77,
		Name:   "fixed",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-a\n2:sk-disabled",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:         true,
			MultiKeySize:       2,
			MultiKeyMode:       constant.MultiKeyModeRandom,
			MultiKeyStatusList: map[int]int{1: common.ChannelStatusAutoDisabled},
		},
	}

	key, index, err := selectMultiKeyForTest(channel, 1)

	require.NoError(t, err)
	require.Equal(t, "sk-disabled", key)
	require.Equal(t, 1, index)
}

func TestManageMultiKeysEnableAutoDisabledKeysNoopsWhenNoneExist(t *testing.T) {
	db := setupChannelKeyScriptTestDB(t)
	channel := model.Channel{
		Name:   "manual-only",
		Type:   constant.ChannelTypeOpenAI,
		Key:    "1:sk-enabled\n2:sk-manual",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:             true,
			MultiKeySize:           2,
			MultiKeyMode:           constant.MultiKeyModeRandom,
			MultiKeyStatusList:     map[int]int{1: common.ChannelStatusManuallyDisabled},
			MultiKeyDisabledReason: map[int]string{1: "manual"},
			MultiKeyDisabledTime:   map[int]int64{1: 200},
		},
	}
	require.NoError(t, db.Create(&channel).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/multi_key/manage", map[string]any{
		"channel_id": channel.Id,
		"action":     "enable_auto_disabled_keys",
	}, 1)

	ManageMultiKeys(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    int    `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.False(t, response.Success)
	require.Equal(t, 0, response.Data)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, map[int]int{1: common.ChannelStatusManuallyDisabled}, stored.ChannelInfo.MultiKeyStatusList)
	require.Equal(t, map[int]string{1: "manual"}, stored.ChannelInfo.MultiKeyDisabledReason)
	require.Equal(t, map[int]int64{1: 200}, stored.ChannelInfo.MultiKeyDisabledTime)
}

func TestSaveChannelKeyScriptRejectsMissingChannel(t *testing.T) {
	setupChannelKeyScriptTestDB(t)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/channel/999/key_script", map[string]string{
		"script": "print('sk-new')",
	}, 1)
	ctx.Params = append(ctx.Params, gin.Param{Key: "id", Value: "999"})

	SaveChannelKeyScript(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.False(t, response.Success)
	require.Contains(t, response.Message, "channel not found")
}
