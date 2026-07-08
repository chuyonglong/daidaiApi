package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type batchCreateChannelsAPIResponse struct {
	Success bool                        `json:"success"`
	Message string                      `json:"message"`
	Data    BatchCreateChannelsResponse `json:"data"`
}

func setupChannelBatchCreateTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	originalDB := model.DB
	originalLogDB := model.LOG_DB
	originalUsingSQLite := common.UsingSQLite
	originalUsingMySQL := common.UsingMySQL
	originalUsingPostgreSQL := common.UsingPostgreSQL
	originalRedisEnabled := common.RedisEnabled

	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		common.UsingSQLite = originalUsingSQLite
		common.UsingMySQL = originalUsingMySQL
		common.UsingPostgreSQL = originalUsingPostgreSQL
		common.RedisEnabled = originalRedisEnabled
	})

	return db
}

func newBatchCreateChannelsContext(t *testing.T, body any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	payload, err := common.Marshal(body)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/batch_create", bytes.NewReader(payload))
	ctx.Request.Header.Set("Content-Type", "application/json")
	return ctx, recorder
}

func decodeBatchCreateChannelsResponse(t *testing.T, recorder *httptest.ResponseRecorder) batchCreateChannelsAPIResponse {
	t.Helper()

	var response batchCreateChannelsAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func TestBatchCreateChannelsCreatesChannelsWithIndependentBaseURLs(t *testing.T) {
	db := setupChannelBatchCreateTestDB(t)
	baseURL := "https://api.a.example.com"

	ctx, recorder := newBatchCreateChannelsContext(t, []model.Channel{
		{
			Id:           99,
			Name:         "OpenAI A",
			Type:         constant.ChannelTypeOpenAI,
			Key:          "sk-a",
			BaseURL:      &baseURL,
			Models:       "gpt-4o,gpt-4o-mini",
			Group:        "default",
			CreatedTime:  123,
			TestTime:     456,
			ResponseTime: 789,
			Balance:      12.34,
			UsedQuota:    987,
		},
		{
			Name:   "OpenAI B",
			Type:   constant.ChannelTypeOpenAI,
			Key:    "sk-b",
			Models: "gpt-4o",
			Status: common.ChannelStatusManuallyDisabled,
		},
	})

	BatchCreateChannels(ctx)

	response := decodeBatchCreateChannelsResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	require.Equal(t, 2, response.Data.CreatedCount)
	require.Len(t, response.Data.Ids, 2)
	require.NotZero(t, response.Data.Ids[0])
	require.NotZero(t, response.Data.Ids[1])

	var channels []model.Channel
	require.NoError(t, db.Order("id asc").Find(&channels).Error)
	require.Len(t, channels, 2)
	require.NotEqual(t, 99, channels[0].Id)
	require.Equal(t, baseURL, *channels[0].BaseURL)
	if channels[1].BaseURL != nil {
		require.Empty(t, *channels[1].BaseURL)
	}
	require.Equal(t, "default", channels[1].Group)
	require.Equal(t, common.ChannelStatusEnabled, channels[0].Status)
	require.Equal(t, common.ChannelStatusManuallyDisabled, channels[1].Status)
	require.Zero(t, channels[0].TestTime)
	require.Zero(t, channels[0].ResponseTime)
	require.Zero(t, channels[0].Balance)
	require.Zero(t, channels[0].UsedQuota)
	require.NotEqual(t, int64(123), channels[0].CreatedTime)

	var abilities []model.Ability
	require.NoError(t, db.Order("channel_id asc, model asc").Find(&abilities).Error)
	require.Len(t, abilities, 3)
	require.True(t, abilities[0].Enabled)
	require.True(t, abilities[1].Enabled)
	require.False(t, abilities[2].Enabled)
}

func TestBatchCreateChannelsRejectsInvalidChannelBeforeInsert(t *testing.T) {
	db := setupChannelBatchCreateTestDB(t)

	ctx, recorder := newBatchCreateChannelsContext(t, []model.Channel{
		{
			Name:   "Valid",
			Type:   constant.ChannelTypeOpenAI,
			Key:    "sk-valid",
			Models: "gpt-4o",
		},
		{
			Name:   "Missing Key",
			Type:   constant.ChannelTypeOpenAI,
			Models: "gpt-4o",
		},
	})

	BatchCreateChannels(ctx)

	response := decodeBatchCreateChannelsResponse(t, recorder)
	require.False(t, response.Success)
	require.Contains(t, response.Message, "channels[2]")

	var channelCount int64
	require.NoError(t, db.Model(&model.Channel{}).Count(&channelCount).Error)
	require.Zero(t, channelCount)

	var abilityCount int64
	require.NoError(t, db.Model(&model.Ability{}).Count(&abilityCount).Error)
	require.Zero(t, abilityCount)
}

func TestBatchCreateChannelsRejectsMoreThanLimitBeforeInsert(t *testing.T) {
	db := setupChannelBatchCreateTestDB(t)
	channels := make([]model.Channel, batchCreateChannelsLimit+1)
	for i := range channels {
		channels[i] = model.Channel{
			Name:   fmt.Sprintf("OpenAI %d", i+1),
			Type:   constant.ChannelTypeOpenAI,
			Key:    fmt.Sprintf("sk-%d", i+1),
			Models: "gpt-4o",
		}
	}

	ctx, recorder := newBatchCreateChannelsContext(t, channels)

	BatchCreateChannels(ctx)

	response := decodeBatchCreateChannelsResponse(t, recorder)
	require.False(t, response.Success)
	require.Contains(t, response.Message, "maximum of 200")

	var channelCount int64
	require.NoError(t, db.Model(&model.Channel{}).Count(&channelCount).Error)
	require.Zero(t, channelCount)

	var abilityCount int64
	require.NoError(t, db.Model(&model.Ability{}).Count(&abilityCount).Error)
	require.Zero(t, abilityCount)
}

func TestBatchCreateChannelsIgnoresDuplicateBaseURLAndKey(t *testing.T) {
	db := setupChannelBatchCreateTestDB(t)
	baseURL := "https://api.example.com"

	ctx, recorder := newBatchCreateChannelsContext(t, []model.Channel{
		{
			Name:    "OpenAI A",
			Type:    constant.ChannelTypeOpenAI,
			Key:     " sk-same ",
			BaseURL: &baseURL,
			Models:  "gpt-4o",
		},
		{
			Name:    "OpenAI Duplicate",
			Type:    constant.ChannelTypeOpenAI,
			Key:     "sk-same",
			BaseURL: &baseURL,
			Models:  "gpt-4o-mini",
		},
		{
			Name:    "OpenAI B",
			Type:    constant.ChannelTypeOpenAI,
			Key:     "sk-other",
			BaseURL: &baseURL,
			Models:  "gpt-4o-mini",
		},
	})

	BatchCreateChannels(ctx)

	response := decodeBatchCreateChannelsResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	require.Equal(t, 2, response.Data.CreatedCount)
	require.Len(t, response.Data.Ids, 2)

	var channels []model.Channel
	require.NoError(t, db.Order("id asc").Find(&channels).Error)
	require.Len(t, channels, 2)
	require.Equal(t, "OpenAI A", channels[0].Name)
	require.Equal(t, "sk-same", channels[0].Key)
	require.Equal(t, "OpenAI B", channels[1].Name)

	var abilities []model.Ability
	require.NoError(t, db.Order("channel_id asc, model asc").Find(&abilities).Error)
	require.Len(t, abilities, 2)
	require.Equal(t, "gpt-4o", abilities[0].Model)
	require.Equal(t, "gpt-4o-mini", abilities[1].Model)
}

func TestBatchCreateChannelsNormalizesMultiKeyRuntimeState(t *testing.T) {
	db := setupChannelBatchCreateTestDB(t)

	ctx, recorder := newBatchCreateChannelsContext(t, []model.Channel{
		{
			Name:   "Multi Key",
			Type:   constant.ChannelTypeOpenAI,
			Key:    "sk-a\n\nsk-b",
			Models: "gpt-4o",
			ChannelInfo: model.ChannelInfo{
				IsMultiKey:             true,
				MultiKeySize:           99,
				MultiKeyStatusList:     map[int]int{0: common.ChannelStatusAutoDisabled},
				MultiKeyDisabledReason: map[int]string{0: "old failure"},
				MultiKeyDisabledTime:   map[int]int64{0: 123},
				MultiKeyPollingIndex:   9,
				MultiKeyMode:           constant.MultiKeyModePolling,
			},
		},
	})

	BatchCreateChannels(ctx)

	response := decodeBatchCreateChannelsResponse(t, recorder)
	require.True(t, response.Success, response.Message)

	var channel model.Channel
	require.NoError(t, db.First(&channel).Error)
	require.True(t, channel.ChannelInfo.IsMultiKey)
	require.Equal(t, 2, channel.ChannelInfo.MultiKeySize)
	require.Equal(t, constant.MultiKeyModePolling, channel.ChannelInfo.MultiKeyMode)
	require.Zero(t, channel.ChannelInfo.MultiKeyPollingIndex)
	require.Nil(t, channel.ChannelInfo.MultiKeyStatusList)
	require.Nil(t, channel.ChannelInfo.MultiKeyDisabledReason)
	require.Nil(t, channel.ChannelInfo.MultiKeyDisabledTime)
}

func TestBatchCreateChannelsAcceptsCodexMultiKeyOAuthJSONLines(t *testing.T) {
	db := setupChannelBatchCreateTestDB(t)

	ctx, recorder := newBatchCreateChannelsContext(t, []model.Channel{
		{
			Name:   "Codex Multi",
			Type:   constant.ChannelTypeCodex,
			Key:    `{"access_token":"at-one","account_id":"acct-one"}` + "\n" + `{"access_token":"at-two","account_id":"acct-two","refresh_token":""}`,
			Models: "gpt-5-codex",
			ChannelInfo: model.ChannelInfo{
				IsMultiKey:   true,
				MultiKeyMode: constant.MultiKeyModeRandom,
			},
		},
	})

	BatchCreateChannels(ctx)

	response := decodeBatchCreateChannelsResponse(t, recorder)
	require.True(t, response.Success, response.Message)

	var channel model.Channel
	require.NoError(t, db.First(&channel).Error)
	require.True(t, channel.ChannelInfo.IsMultiKey)
	require.Equal(t, 2, channel.ChannelInfo.MultiKeySize)
	require.Equal(t, constant.MultiKeyModeRandom, channel.ChannelInfo.MultiKeyMode)
	require.Equal(t, []string{
		`{"access_token":"at-one","account_id":"acct-one"}`,
		`{"access_token":"at-two","account_id":"acct-two","refresh_token":""}`,
	}, channel.GetKeys())
}

func TestBatchCreateChannelsRejectsCodexMultiKeyMissingAccountID(t *testing.T) {
	db := setupChannelBatchCreateTestDB(t)

	ctx, recorder := newBatchCreateChannelsContext(t, []model.Channel{
		{
			Name:   "Codex Multi",
			Type:   constant.ChannelTypeCodex,
			Key:    `{"access_token":"at-one","account_id":"acct-one"}` + "\n" + `{"access_token":"at-two"}`,
			Models: "gpt-5-codex",
			ChannelInfo: model.ChannelInfo{
				IsMultiKey:   true,
				MultiKeyMode: constant.MultiKeyModeRandom,
			},
		},
	})

	BatchCreateChannels(ctx)

	response := decodeBatchCreateChannelsResponse(t, recorder)
	require.False(t, response.Success)
	require.Contains(t, response.Message, "account_id")

	var channelCount int64
	require.NoError(t, db.Model(&model.Channel{}).Count(&channelCount).Error)
	require.Zero(t, channelCount)
}
