package controller

import (
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

type channelListUsageResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Items []model.Channel `json:"items"`
	} `json:"data"`
}

func setupChannelUsageRangeTestDB(t *testing.T) *gorm.DB {
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
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Log{}))

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

func TestGetAllChannelsUsesRangedUsageWhenRequested(t *testing.T) {
	db := setupChannelUsageRangeTestDB(t)
	require.NoError(t, db.Create(&[]model.Channel{
		{Id: 24, Type: 1, Name: "channel-a", Status: common.ChannelStatusEnabled, UsedQuota: 999},
		{Id: 5, Type: 1, Name: "channel-b", Status: common.ChannelStatusEnabled, UsedQuota: 888},
		{Id: 9, Type: 1, Name: "channel-c", Status: common.ChannelStatusEnabled, UsedQuota: 777},
	}).Error)
	require.NoError(t, db.Create(&[]model.Log{
		{CreatedAt: 100, Type: model.LogTypeConsume, ChannelId: 24, Quota: 100},
		{CreatedAt: 120, Type: model.LogTypeConsume, ChannelId: 24, Quota: 300},
		{CreatedAt: 120, Type: model.LogTypeConsume, ChannelId: 5, Quota: 200},
		{CreatedAt: 130, Type: model.LogTypeConsume, ChannelId: 24, Quota: 400},
		{CreatedAt: 120, Type: model.LogTypeTopup, ChannelId: 24, Quota: 900},
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/channel/?include_usage=true&start_timestamp=110&end_timestamp=125&p=1&page_size=10", nil)

	GetAllChannels(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response channelListUsageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Items, 3)
	quotaByID := map[int]int64{}
	for _, item := range response.Data.Items {
		quotaByID[item.Id] = item.UsedQuota
	}
	require.Equal(t, map[int]int64{
		24: 300,
		5:  200,
		9:  0,
	}, quotaByID)
}

func TestSearchChannelsUsesRangedUsageWhenRequested(t *testing.T) {
	db := setupChannelUsageRangeTestDB(t)
	require.NoError(t, db.Create(&[]model.Channel{
		{Id: 24, Type: 1, Name: "alpha", Key: "sk-alpha", Models: "gpt-4", Status: common.ChannelStatusEnabled, UsedQuota: 999},
		{Id: 5, Type: 1, Name: "beta", Key: "sk-beta", Models: "gpt-4", Status: common.ChannelStatusEnabled, UsedQuota: 888},
	}).Error)
	require.NoError(t, db.Create(&[]model.Log{
		{CreatedAt: 100, Type: model.LogTypeConsume, ChannelId: 24, Quota: 100},
		{CreatedAt: 120, Type: model.LogTypeConsume, ChannelId: 24, Quota: 300},
		{CreatedAt: 120, Type: model.LogTypeConsume, ChannelId: 5, Quota: 200},
		{CreatedAt: 130, Type: model.LogTypeConsume, ChannelId: 24, Quota: 400},
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/channel/search?keyword=&model=gpt&include_usage=true&start_timestamp=110&end_timestamp=125&p=1&page_size=10", nil)

	SearchChannels(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response channelListUsageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Items, 2)
	quotaByID := map[int]int64{}
	for _, item := range response.Data.Items {
		quotaByID[item.Id] = item.UsedQuota
	}
	require.Equal(t, map[int]int64{
		24: 300,
		5:  200,
	}, quotaByID)
}
