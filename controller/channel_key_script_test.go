package controller

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

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
	require.NoError(t, db.AutoMigrate(&model.ChannelKeyScript{}))
	return db
}

func TestExtractChannelKeyScriptKeysFindsSkKeysAndDeduplicates(t *testing.T) {
	keys := extractChannelKeyScriptKeys("log sk-alpha_123 more\nstderr sk-beta-456\nsk-alpha_123")

	require.Equal(t, []string{"sk-alpha_123", "sk-beta-456"}, keys)
}

func TestMergeChannelKeyScriptKeysAppendsOnlyNewKeys(t *testing.T) {
	merged := mergeChannelKeyScriptKeys("sk-old\n sk-same \n", []string{"sk-new", "sk-same", "sk-newer"})

	require.Equal(t, "sk-old\nsk-same\nsk-new\nsk-newer", merged)
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
	require.Equal(t, "sk-old\nsk-new\nsk-disabled", result.Key)
	require.Equal(t, 3, result.ChannelInfo.MultiKeySize)
	require.Equal(t, constant.MultiKeyModePolling, result.ChannelInfo.MultiKeyMode)
	require.Equal(t, map[int]int{1: common.ChannelStatusAutoDisabled}, result.ChannelInfo.MultiKeyStatusList)
	require.Equal(t, map[int]string{1: "bad"}, result.ChannelInfo.MultiKeyDisabledReason)
	require.Equal(t, map[int]int64{1: 100}, result.ChannelInfo.MultiKeyDisabledTime)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, "sk-old\nsk-new\nsk-disabled", stored.Key)
	require.Equal(t, 3, stored.ChannelInfo.MultiKeySize)
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
	require.Equal(t, "sk-old\nsk-new-123", data.MergedKey)
	require.True(t, data.IsMultiKey)
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
