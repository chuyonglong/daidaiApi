package operation_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestParseHTTPStatusCodeRanges_CommaSeparated(t *testing.T) {
	ranges, err := ParseHTTPStatusCodeRanges("401,403,500-599")
	require.NoError(t, err)
	require.Equal(t, []StatusCodeRange{
		{Start: 401, End: 401},
		{Start: 403, End: 403},
		{Start: 500, End: 599},
	}, ranges)
}

func TestParseHTTPStatusCodeRanges_MergeAndNormalize(t *testing.T) {
	ranges, err := ParseHTTPStatusCodeRanges("500-505,504,401,403,402")
	require.NoError(t, err)
	require.Equal(t, []StatusCodeRange{
		{Start: 401, End: 403},
		{Start: 500, End: 505},
	}, ranges)
}

func TestParseHTTPStatusCodeRanges_Invalid(t *testing.T) {
	_, err := ParseHTTPStatusCodeRanges("99,600,foo,500-400,500-")
	require.Error(t, err)
}

func TestParseHTTPStatusCodeRanges_NoComma_IsInvalid(t *testing.T) {
	_, err := ParseHTTPStatusCodeRanges("401 403")
	require.Error(t, err)
}

func TestShouldDisableByStatusCode(t *testing.T) {
	orig := AutomaticDisableStatusCodeRanges
	t.Cleanup(func() { AutomaticDisableStatusCodeRanges = orig })

	AutomaticDisableStatusCodeRanges = []StatusCodeRange{
		{Start: 401, End: 403},
		{Start: 500, End: 599},
	}

	require.True(t, ShouldDisableByStatusCode(401))
	require.True(t, ShouldDisableByStatusCode(403))
	require.False(t, ShouldDisableByStatusCode(404))
	require.True(t, ShouldDisableByStatusCode(500))
	require.False(t, ShouldDisableByStatusCode(200))
}

func TestShouldRetryByStatusCode(t *testing.T) {
	orig := AutomaticRetryStatusCodeRanges
	t.Cleanup(func() { AutomaticRetryStatusCodeRanges = orig })

	AutomaticRetryStatusCodeRanges = []StatusCodeRange{
		{Start: 429, End: 429},
		{Start: 500, End: 599},
	}

	require.True(t, ShouldRetryByStatusCode(429))
	require.True(t, ShouldRetryByStatusCode(500))
	require.False(t, ShouldRetryByStatusCode(504))
	require.False(t, ShouldRetryByStatusCode(524))
	require.False(t, ShouldRetryByStatusCode(400))
	require.False(t, ShouldRetryByStatusCode(200))
}

func TestParseErrorCodes_NormalizesAndDeduplicates(t *testing.T) {
	codes, err := ParseErrorCodes("rate_limit_cooldown, provider.cooldown, channel:no_available_key, rate_limit_cooldown")
	require.NoError(t, err)
	require.Equal(t, []types.ErrorCode{
		"channel:no_available_key",
		"provider.cooldown",
		types.ErrorCodeRateLimitCooldown,
	}, codes)
}

func TestParseErrorCodes_Invalid(t *testing.T) {
	_, err := ParseErrorCodes("rate_limit_cooldown, bad code")
	require.Error(t, err)
}

func TestShouldRetryByErrorCode(t *testing.T) {
	orig := AutomaticRetryErrorCodes
	t.Cleanup(func() { AutomaticRetryErrorCodes = orig })

	AutomaticRetryErrorCodes = []types.ErrorCode{
		types.ErrorCodeRateLimitCooldown,
		"provider_cooldown",
	}

	require.True(t, ShouldRetryByErrorCode(types.ErrorCodeRateLimitCooldown))
	require.True(t, ShouldRetryByErrorCode("provider_cooldown"))
	require.False(t, ShouldRetryByErrorCode("invalid_request_error"))
	require.False(t, ShouldRetryByErrorCode(""))
}

func TestShouldRetryByStatusCode_DefaultMatchesLegacyBehavior(t *testing.T) {
	require.False(t, ShouldRetryByStatusCode(200))
	require.False(t, ShouldRetryByStatusCode(400))
	require.True(t, ShouldRetryByStatusCode(401))
	require.False(t, ShouldRetryByStatusCode(408))
	require.True(t, ShouldRetryByStatusCode(429))
	require.True(t, ShouldRetryByStatusCode(500))
	require.False(t, ShouldRetryByStatusCode(504))
	require.False(t, ShouldRetryByStatusCode(524))
	require.True(t, ShouldRetryByStatusCode(599))
}

func TestIsAlwaysSkipRetryStatusCode(t *testing.T) {
	require.True(t, IsAlwaysSkipRetryStatusCode(504))
	require.True(t, IsAlwaysSkipRetryStatusCode(524))
	require.False(t, IsAlwaysSkipRetryStatusCode(500))
}
