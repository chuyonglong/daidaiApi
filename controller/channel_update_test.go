package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type updateChannelAPIResponse struct {
	Success bool          `json:"success"`
	Message string        `json:"message"`
	Data    model.Channel `json:"data"`
}

func newUpdateChannelContext(t *testing.T, body any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	payload, err := common.Marshal(body)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPut, "/api/channel/", bytes.NewReader(payload))
	ctx.Request.Header.Set("Content-Type", "application/json")
	return ctx, recorder
}

func decodeUpdateChannelResponse(t *testing.T, recorder *httptest.ResponseRecorder) updateChannelAPIResponse {
	t.Helper()

	var response updateChannelAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func insertUpdateChannelFixture(t *testing.T, channel model.Channel) model.Channel {
	t.Helper()
	db := setupChannelBatchCreateTestDB(t)

	if channel.Name == "" {
		channel.Name = "OpenAI"
	}
	if channel.Type == 0 {
		channel.Type = constant.ChannelTypeOpenAI
	}
	if channel.Key == "" {
		channel.Key = "sk-existing"
	}
	if channel.Models == "" {
		channel.Models = "gpt-4o"
	}
	if channel.Group == "" {
		channel.Group = "default"
	}
	if channel.Status == 0 {
		channel.Status = common.ChannelStatusEnabled
	}

	require.NoError(t, db.Create(&channel).Error)
	require.NoError(t, channel.AddAbilities(nil))
	return channel
}

func TestUpdateChannelSwitchesSingleKeyChannelToMultiKeyWithExistingKey(t *testing.T) {
	channel := insertUpdateChannelFixture(t, model.Channel{Key: "sk-one"})
	isMultiKey := true
	multiKeyMode := "random"

	ctx, recorder := newUpdateChannelContext(t, gin.H{
		"id":             channel.Id,
		"name":           "OpenAI updated",
		"type":           constant.ChannelTypeOpenAI,
		"models":         "gpt-4o",
		"group":          "default",
		"status":         common.ChannelStatusEnabled,
		"auto_ban":       1,
		"is_multi_key":   isMultiKey,
		"multi_key_mode": multiKeyMode,
	})

	UpdateChannel(ctx)

	response := decodeUpdateChannelResponse(t, recorder)
	require.True(t, response.Success, response.Message)

	var stored model.Channel
	require.NoError(t, model.DB.First(&stored, channel.Id).Error)
	require.Equal(t, "sk-one", stored.Key)
	require.True(t, stored.ChannelInfo.IsMultiKey)
	require.Equal(t, 1, stored.ChannelInfo.MultiKeySize)
	require.Equal(t, constant.MultiKeyModeRandom, stored.ChannelInfo.MultiKeyMode)
}

func TestUpdateChannelSwitchesMultiKeyChannelToSingleKey(t *testing.T) {
	channel := insertUpdateChannelFixture(t, model.Channel{
		Key: "sk-a\nsk-b",
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:           true,
			MultiKeySize:         2,
			MultiKeyStatusList:   map[int]int{1: common.ChannelStatusAutoDisabled},
			MultiKeyPollingIndex: 1,
			MultiKeyMode:         constant.MultiKeyModePolling,
		},
	})
	isMultiKey := false

	ctx, recorder := newUpdateChannelContext(t, gin.H{
		"id":           channel.Id,
		"name":         "OpenAI single",
		"type":         constant.ChannelTypeOpenAI,
		"models":       "gpt-4o",
		"group":        "default",
		"status":       common.ChannelStatusEnabled,
		"auto_ban":     1,
		"is_multi_key": isMultiKey,
	})

	UpdateChannel(ctx)

	response := decodeUpdateChannelResponse(t, recorder)
	require.True(t, response.Success, response.Message)

	var stored model.Channel
	require.NoError(t, model.DB.First(&stored, channel.Id).Error)
	require.False(t, stored.ChannelInfo.IsMultiKey)
	require.Zero(t, stored.ChannelInfo.MultiKeySize)
	require.Empty(t, stored.ChannelInfo.MultiKeyStatusList)
	require.Empty(t, stored.ChannelInfo.MultiKeyMode)
}

func TestUpdateChannelRejectsInvalidMultiKeyMode(t *testing.T) {
	channel := insertUpdateChannelFixture(t, model.Channel{Key: "sk-one"})
	isMultiKey := true

	ctx, recorder := newUpdateChannelContext(t, gin.H{
		"id":             channel.Id,
		"name":           "OpenAI updated",
		"type":           constant.ChannelTypeOpenAI,
		"models":         "gpt-4o",
		"group":          "default",
		"status":         common.ChannelStatusEnabled,
		"auto_ban":       1,
		"is_multi_key":   isMultiKey,
		"multi_key_mode": "bad-mode",
	})

	UpdateChannel(ctx)

	response := decodeUpdateChannelResponse(t, recorder)
	require.False(t, response.Success)
	require.Contains(t, response.Message, "multi-key mode")
}
