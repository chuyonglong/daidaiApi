package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setAutomaticRetryErrorCodesForTest(t *testing.T, codes []types.ErrorCode) {
	t.Helper()

	orig := operation_setting.AutomaticRetryErrorCodes
	t.Cleanup(func() { operation_setting.AutomaticRetryErrorCodes = orig })
	operation_setting.AutomaticRetryErrorCodes = codes
}

func TestShouldRetryRateLimitCooldownBadRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setAutomaticRetryErrorCodesForTest(t, []types.ErrorCode{types.ErrorCodeRateLimitCooldown})

	c, _ := gin.CreateTestContext(nil)
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "cooldown",
		Type:    "invalid_request_error",
		Code:    string(types.ErrorCodeRateLimitCooldown),
	}, http.StatusBadRequest)

	require.True(t, shouldRetry(c, err, 1))
}

func TestShouldRetryConfiguredBadRequestErrorCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setAutomaticRetryErrorCodesForTest(t, []types.ErrorCode{"provider_cooldown"})

	c, _ := gin.CreateTestContext(nil)
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "cooldown",
		Type:    "invalid_request_error",
		Code:    "provider_cooldown",
	}, http.StatusBadRequest)

	require.True(t, shouldRetry(c, err, 1))
}

func TestShouldRetryBadRequestStillSkipsOtherInvalidRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setAutomaticRetryErrorCodesForTest(t, []types.ErrorCode{types.ErrorCodeRateLimitCooldown})

	c, _ := gin.CreateTestContext(nil)
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "invalid request",
		Type:    "invalid_request_error",
		Code:    "invalid_request_error",
	}, http.StatusBadRequest)

	require.False(t, shouldRetry(c, err, 1))
}

func TestShouldRetryRateLimitCooldownRequiresRetryBudget(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setAutomaticRetryErrorCodesForTest(t, []types.ErrorCode{types.ErrorCodeRateLimitCooldown})

	c, _ := gin.CreateTestContext(nil)
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "cooldown",
		Type:    "invalid_request_error",
		Code:    string(types.ErrorCodeRateLimitCooldown),
	}, http.StatusBadRequest)

	require.False(t, shouldRetry(c, err, 0))
}

func TestShouldRetryRateLimitCooldownSkipsSpecificChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setAutomaticRetryErrorCodesForTest(t, []types.ErrorCode{types.ErrorCodeRateLimitCooldown})

	c, _ := gin.CreateTestContext(nil)
	c.Set("specific_channel_id", 1)
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "cooldown",
		Type:    "invalid_request_error",
		Code:    string(types.ErrorCodeRateLimitCooldown),
	}, http.StatusBadRequest)

	require.False(t, shouldRetry(c, err, 1))
}
