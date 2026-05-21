package service

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestResetStatusCode(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name             string
		statusCode       int
		statusCodeConfig string
		expectedCode     int
	}{
		{
			name:             "map string value",
			statusCode:       429,
			statusCodeConfig: `{"429":"503"}`,
			expectedCode:     503,
		},
		{
			name:             "map int value",
			statusCode:       429,
			statusCodeConfig: `{"429":503}`,
			expectedCode:     503,
		},
		{
			name:             "skip invalid string value",
			statusCode:       429,
			statusCodeConfig: `{"429":"bad-code"}`,
			expectedCode:     429,
		},
		{
			name:             "skip status code 200",
			statusCode:       200,
			statusCodeConfig: `{"200":503}`,
			expectedCode:     200,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			newAPIError := &types.NewAPIError{
				StatusCode: tc.statusCode,
			}
			ResetStatusCode(newAPIError, tc.statusCodeConfig)
			require.Equal(t, tc.expectedCode, newAPIError.StatusCode)
		})
	}
}

func TestRelayErrorHandlerParsesRateLimitCooldownCode(t *testing.T) {
	cooldownMessage := "\u4e00\u5206\u949f30\u6b21 \uff0c\u51b7\u537420\u79d2"
	responseBody := `{"error":{"message":"\u4e00\u5206\u949f30\u6b21 \uff0c\u51b7\u537420\u79d2","type":"invalid_request_error","code":"rate_limit_cooldown"},"message":"\u4e00\u5206\u949f30\u6b21 \uff0c\u51b7\u537420\u79d2","code":"rate_limit_cooldown","limit_type":"cooldown"}`
	resp := &http.Response{
		StatusCode: http.StatusBadRequest,
		Body:       io.NopCloser(strings.NewReader(responseBody)),
	}

	newAPIError := RelayErrorHandler(context.Background(), resp, true)

	require.NotNil(t, newAPIError)
	require.Equal(t, http.StatusBadRequest, newAPIError.StatusCode)
	require.Equal(t, types.ErrorCodeRateLimitCooldown, newAPIError.GetErrorCode())
	require.Equal(t, cooldownMessage, newAPIError.ToOpenAIError().Message)
}

func TestRelayErrorHandlerKeepsRawBodyForHiddenPlainTextErrors(t *testing.T) {
	responseBody := "切换key需要冷却30秒"
	resp := &http.Response{
		StatusCode: http.StatusBadRequest,
		Body:       io.NopCloser(strings.NewReader(responseBody)),
	}

	newAPIError := RelayErrorHandler(context.Background(), resp, false)

	require.NotNil(t, newAPIError)
	require.Equal(t, http.StatusBadRequest, newAPIError.StatusCode)
	require.Equal(t, types.ErrorCodeBadResponseStatusCode, newAPIError.GetErrorCode())
	require.Equal(t, responseBody, newAPIError.GetResponseBody())
	require.NotContains(t, newAPIError.Error(), responseBody)
}
