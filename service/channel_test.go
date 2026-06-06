package service

import (
	"errors"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestShouldDisableChannelSkipsNetworkErrors(t *testing.T) {
	origEnabled := common.AutomaticDisableChannelEnabled
	origRanges := operation_setting.AutomaticDisableStatusCodeRanges
	t.Cleanup(func() {
		common.AutomaticDisableChannelEnabled = origEnabled
		operation_setting.AutomaticDisableStatusCodeRanges = origRanges
	})
	common.AutomaticDisableChannelEnabled = true
	operation_setting.AutomaticDisableStatusCodeRanges = []operation_setting.StatusCodeRange{{Start: 500, End: 599}}

	err := types.NewErrorWithStatusCode(
		errors.New("dial tcp: i/o timeout"),
		types.ErrorCodeDoRequestFailed,
		http.StatusInternalServerError,
	)

	require.False(t, ShouldDisableChannel(err))
}

func TestBuildMultiKeyErrorSummaryKeepsReasonShort(t *testing.T) {
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "Incorrect API key provided",
		Type:    "invalid_request_error",
		Code:    "invalid_api_key",
	}, http.StatusUnauthorized)

	summary, ok := BuildMultiKeyErrorSummary(err)

	require.True(t, ok)
	require.Equal(t, http.StatusUnauthorized, summary.Status)
	require.Equal(t, "invalid_api_key", summary.Code)
	require.Equal(t, "认证失败", summary.Reason)
	require.LessOrEqual(t, len([]rune(summary.Reason)), 10)
}
