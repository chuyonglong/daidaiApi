package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func ensureQuotaDataTable(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&QuotaData{}))
	require.NoError(t, DB.Exec("DELETE FROM quota_data").Error)
	CacheQuotaDataLock.Lock()
	CacheQuotaData = make(map[string]*QuotaData)
	CacheQuotaDataLock.Unlock()
}

func TestLogQuotaDataAccumulatesCacheHitFields(t *testing.T) {
	truncateTables(t)
	ensureQuotaDataTable(t)

	LogQuotaData(7, "alice", "gpt-5", 100, 7205, 80, 60, 50)
	LogQuotaData(7, "alice", "gpt-5", 20, 7205, 10, 25, 15)
	SaveQuotaDataCache()

	var row QuotaData
	require.NoError(t, DB.Table("quota_data").
		Where("user_id = ? AND username = ? AND model_name = ? AND created_at = ?", 7, "alice", "gpt-5", 7200).
		First(&row).Error)

	require.Equal(t, 2, row.Count)
	require.Equal(t, 120, row.Quota)
	require.Equal(t, 90, row.TokenUsed)
	require.Equal(t, 85, row.PromptTokenUsed)
	require.Equal(t, 65, row.CacheTokenUsed)
}

func TestIncreaseQuotaDataAccumulatesCacheHitFields(t *testing.T) {
	truncateTables(t)
	ensureQuotaDataTable(t)

	require.NoError(t, DB.Create(&QuotaData{
		UserID:          9,
		Username:        "bob",
		ModelName:       "gpt-5",
		CreatedAt:       7200,
		Count:           1,
		Quota:           100,
		TokenUsed:       80,
		PromptTokenUsed: 70,
		CacheTokenUsed:  10,
	}).Error)

	increaseQuotaData(9, "bob", "gpt-5", 3, 50, 7200, 20, 18, 2)

	var row QuotaData
	require.NoError(t, DB.Table("quota_data").
		Where("user_id = ? AND username = ? AND model_name = ? AND created_at = ?", 9, "bob", "gpt-5", 7200).
		First(&row).Error)

	require.Equal(t, 4, row.Count)
	require.Equal(t, 150, row.Quota)
	require.Equal(t, 100, row.TokenUsed)
	require.Equal(t, 88, row.PromptTokenUsed)
	require.Equal(t, 12, row.CacheTokenUsed)
}

func TestGetAllQuotaDatesRespectsTimeRange(t *testing.T) {
	truncateTables(t)
	ensureQuotaDataTable(t)

	rows := []QuotaData{
		{UserID: 1, Username: "alice", ModelName: "gpt-5", CreatedAt: 3600, Count: 1, Quota: 10, TokenUsed: 8, PromptTokenUsed: 7, CacheTokenUsed: 1},
		{UserID: 1, Username: "alice", ModelName: "gpt-5", CreatedAt: 7200, Count: 1, Quota: 20, TokenUsed: 15, PromptTokenUsed: 12, CacheTokenUsed: 3},
	}
	require.NoError(t, DB.Create(&rows).Error)

	got, err := GetAllQuotaDates(4000, 8000, "")
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, int64(7200), got[0].CreatedAt)
	require.Equal(t, 12, got[0].PromptTokenUsed)
	require.Equal(t, 3, got[0].CacheTokenUsed)
}

func TestGetQuotaDataByUserIdRespectsTimeRange(t *testing.T) {
	truncateTables(t)
	ensureQuotaDataTable(t)

	rows := []QuotaData{
		{UserID: 11, Username: "alice", ModelName: "gpt-5", CreatedAt: 3600, Count: 1, Quota: 10, TokenUsed: 8, PromptTokenUsed: 7, CacheTokenUsed: 1},
		{UserID: 11, Username: "alice", ModelName: "gpt-5", CreatedAt: 7200, Count: 1, Quota: 20, TokenUsed: 15, PromptTokenUsed: 12, CacheTokenUsed: 3},
	}
	require.NoError(t, DB.Create(&rows).Error)

	got, err := GetQuotaDataByUserId(11, 4000, 8000)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, int64(7200), got[0].CreatedAt)
	require.Equal(t, 12, got[0].PromptTokenUsed)
	require.Equal(t, 3, got[0].CacheTokenUsed)
}

func TestGetQuotaDataGroupByUserAggregatesCacheHitFields(t *testing.T) {
	truncateTables(t)
	ensureQuotaDataTable(t)

	rows := []QuotaData{
		{UserID: 11, Username: "alice", ModelName: "gpt-5", CreatedAt: 7200, Count: 1, Quota: 10, TokenUsed: 8, PromptTokenUsed: 7, CacheTokenUsed: 1},
		{UserID: 12, Username: "alice", ModelName: "gpt-5", CreatedAt: 7200, Count: 1, Quota: 20, TokenUsed: 15, PromptTokenUsed: 12, CacheTokenUsed: 3},
	}
	require.NoError(t, DB.Create(&rows).Error)

	got, err := GetQuotaDataGroupByUser(4000, 8000)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "alice", got[0].Username)
	require.Equal(t, 19, got[0].PromptTokenUsed)
	require.Equal(t, 4, got[0].CacheTokenUsed)
}

func TestQuotaDataCreatedAtIsRoundedToHour(t *testing.T) {
	truncateTables(t)
	ensureQuotaDataTable(t)

	LogQuotaData(7, "alice", "gpt-5", 100, time.Unix(3671, 0).Unix(), 80, 60, 50)
	SaveQuotaDataCache()

	var row QuotaData
	require.NoError(t, DB.Table("quota_data").
		Where("user_id = ? AND username = ? AND model_name = ?", 7, "alice", "gpt-5").
		First(&row).Error)

	require.Equal(t, int64(3600), row.CreatedAt)
}
