package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type batchCreateModelsAPIResponse struct {
	Success bool                      `json:"success"`
	Message string                    `json:"message"`
	Data    BatchCreateModelsResponse `json:"data"`
}

func setupModelMetaBatchTestDB(t *testing.T) *gorm.DB {
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
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.Model{}, &model.Vendor{}))

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

func newBatchCreateModelsContext(t *testing.T, body any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	payload, err := common.Marshal(body)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/models/batch", bytes.NewReader(payload))
	ctx.Request.Header.Set("Content-Type", "application/json")
	return ctx, recorder
}

func decodeBatchCreateModelsResponse(t *testing.T, recorder *httptest.ResponseRecorder) batchCreateModelsAPIResponse {
	t.Helper()

	var response batchCreateModelsAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func TestBatchCreateModelsCreatesMissingModelsForVendor(t *testing.T) {
	db := setupModelMetaBatchTestDB(t)
	vendor := model.Vendor{Name: "OpenAI", Status: 1}
	require.NoError(t, vendor.Insert())
	require.NoError(t, db.Create(&model.Ability{Group: "default", Model: "gpt-5-codex", ChannelId: 1, Enabled: true}).Error)

	ctx, recorder := newBatchCreateModelsContext(t, BatchCreateModelsRequest{
		VendorID:   vendor.Id,
		ModelNames: []string{" gpt-5-codex ", "gpt-image-2"},
	})

	BatchCreateModels(ctx)

	response := decodeBatchCreateModelsResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	require.Equal(t, 2, response.Data.CreatedCount)
	require.Zero(t, response.Data.SkippedCount)
	require.Empty(t, response.Data.SkippedModels)

	var models []model.Model
	require.NoError(t, db.Order("model_name asc").Find(&models).Error)
	require.Len(t, models, 2)
	require.Equal(t, "gpt-5-codex", models[0].ModelName)
	require.Equal(t, vendor.Id, models[0].VendorID)
	require.Equal(t, 1, models[0].Status)
	require.Equal(t, 1, models[0].SyncOfficial)
	require.Equal(t, model.NameRuleExact, models[0].NameRule)

	missing, err := model.GetMissingModels()
	require.NoError(t, err)
	require.NotContains(t, missing, "gpt-5-codex")
}

func TestBatchCreateModelsSkipsDuplicatesEmptyAndExistingModels(t *testing.T) {
	db := setupModelMetaBatchTestDB(t)
	vendor := model.Vendor{Name: "Anthropic", Status: 1}
	require.NoError(t, vendor.Insert())
	require.NoError(t, (&model.Model{
		ModelName:    "claude-existing",
		VendorID:     vendor.Id,
		Status:       1,
		SyncOfficial: 1,
		NameRule:     model.NameRuleExact,
	}).Insert())

	ctx, recorder := newBatchCreateModelsContext(t, BatchCreateModelsRequest{
		VendorID: vendor.Id,
		ModelNames: []string{
			"claude-new",
			" claude-new ",
			"",
			"   ",
			"claude-existing",
		},
	})

	BatchCreateModels(ctx)

	response := decodeBatchCreateModelsResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	require.Equal(t, 1, response.Data.CreatedCount)
	require.Equal(t, 4, response.Data.SkippedCount)
	require.ElementsMatch(t, []string{"claude-new", "", "", "claude-existing"}, response.Data.SkippedModels)

	var count int64
	require.NoError(t, db.Model(&model.Model{}).Count(&count).Error)
	require.EqualValues(t, 2, count)
}

func TestBatchCreateModelsRejectsUnknownVendor(t *testing.T) {
	db := setupModelMetaBatchTestDB(t)

	ctx, recorder := newBatchCreateModelsContext(t, BatchCreateModelsRequest{
		VendorID:   404,
		ModelNames: []string{"gpt-5-codex"},
	})

	BatchCreateModels(ctx)

	response := decodeBatchCreateModelsResponse(t, recorder)
	require.False(t, response.Success)
	require.Contains(t, response.Message, "供应商不存在")

	var count int64
	require.NoError(t, db.Model(&model.Model{}).Count(&count).Error)
	require.Zero(t, count)
}
