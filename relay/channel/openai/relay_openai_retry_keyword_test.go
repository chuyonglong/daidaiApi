package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestOpenaiHandlerReturnsRetryableErrorForConfiguredResponseKeyword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	orig := operation_setting.AutomaticRetryErrorKeywords
	t.Cleanup(func() { operation_setting.AutomaticRetryErrorKeywords = orig })
	operation_setting.AutomaticRetryErrorKeywords = []string{"公益暂停一会，通知群1104138863"}

	responseBody := `{"id":"chatcmpl-test","object":"chat.completion","model":"test-model","choices":[{"index":0,"message":{"role":"assistant","content":"公益暂停一会，通知群1104138863"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(responseBody)),
	}
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	usage, err := OpenaiHandler(c, &common.RelayInfo{
		RelayFormat:     types.RelayFormatOpenAI,
		OriginModelName: "test-model",
		ChannelMeta: &common.ChannelMeta{
			UpstreamModelName: "test-model",
		},
	}, resp)

	require.Nil(t, usage)
	require.NotNil(t, err)
	require.Equal(t, http.StatusBadRequest, err.StatusCode)
	require.Equal(t, types.ErrorCodeBadResponse, err.GetErrorCode())
	require.Contains(t, err.GetResponseBody(), "公益暂停一会")
}
