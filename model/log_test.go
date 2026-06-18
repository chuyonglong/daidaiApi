package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestGetAllLogsFiltersByChannelID(t *testing.T) {
	truncateTables(t)

	logs := []*Log{
		{UserId: 1, CreatedAt: 100, Type: LogTypeConsume, ChannelId: 24, Username: "u1"},
		{UserId: 1, CreatedAt: 101, Type: LogTypeConsume, ChannelId: 5, Username: "u1"},
		{UserId: 1, CreatedAt: 102, Type: LogTypeConsume, ChannelId: 24, Username: "u1"},
	}
	require.NoError(t, LOG_DB.Create(&logs).Error)

	got, total, err := GetAllLogs(LogTypeUnknown, 0, 0, "", "", "", 0, 20, 24, "", "", "")
	require.NoError(t, err)
	require.Equal(t, int64(2), total)
	require.Len(t, got, 2)
	for _, log := range got {
		require.Equal(t, 24, log.ChannelId)
	}
}

func TestSumUsedQuotaFiltersByChannelID(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()

	logs := []*Log{
		{UserId: 1, CreatedAt: now, Type: LogTypeConsume, ChannelId: 24, Username: "u1", Quota: 100, PromptTokens: 10, CompletionTokens: 5},
		{UserId: 1, CreatedAt: now, Type: LogTypeConsume, ChannelId: 5, Username: "u1", Quota: 200, PromptTokens: 20, CompletionTokens: 7},
		{UserId: 1, CreatedAt: now, Type: LogTypeConsume, ChannelId: 24, Username: "u1", Quota: 300, PromptTokens: 30, CompletionTokens: 9},
	}
	require.NoError(t, LOG_DB.Create(&logs).Error)

	stat, err := SumUsedQuota(LogTypeUnknown, 0, 0, "", "", "", 24, "")
	require.NoError(t, err)
	require.Equal(t, 400, stat.Quota)
	require.Equal(t, 2, stat.Rpm)
	require.Equal(t, 54, stat.Tpm)
}

func TestSumChannelUsedQuotaByRange(t *testing.T) {
	truncateTables(t)

	logs := []*Log{
		{UserId: 1, CreatedAt: 100, Type: LogTypeConsume, ChannelId: 24, Username: "u1", Quota: 100},
		{UserId: 1, CreatedAt: 120, Type: LogTypeConsume, ChannelId: 24, Username: "u1", Quota: 300},
		{UserId: 1, CreatedAt: 120, Type: LogTypeConsume, ChannelId: 5, Username: "u1", Quota: 200},
		{UserId: 1, CreatedAt: 130, Type: LogTypeConsume, ChannelId: 24, Username: "u1", Quota: 400},
		{UserId: 1, CreatedAt: 120, Type: LogTypeTopup, ChannelId: 24, Username: "u1", Quota: 900},
	}
	require.NoError(t, LOG_DB.Create(&logs).Error)

	got, err := SumChannelUsedQuotaByRange([]int{24, 5, 9}, 110, 125)

	require.NoError(t, err)
	require.Equal(t, map[int]int64{
		24: 300,
		5:  200,
		9:  0,
	}, got)
}
