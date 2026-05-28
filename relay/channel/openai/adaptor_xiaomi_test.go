package openai

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestAdaptorUsesXiaomiModelMetadata(t *testing.T) {
	adaptor := &Adaptor{ChannelType: constant.ChannelTypeXiaomi}

	require.Equal(t, "xiaomi", adaptor.GetChannelName())
	require.Equal(t, []string{"MiMo-VL-7B-RL", "MiMo-7B-RL"}, adaptor.GetModelList())
}

func TestAdaptorUsesXiaomiAPIKeyHeader(t *testing.T) {
	adaptor := &Adaptor{ChannelType: constant.ChannelTypeXiaomi}
	header := http.Header{}
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	err := adaptor.SetupRequestHeader(c, &header, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: constant.ChannelTypeXiaomi,
			ApiKey:      "sk-test",
		},
	})

	require.NoError(t, err)
	require.Equal(t, "sk-test", header.Get("api-key"))
	require.Empty(t, header.Get("Authorization"))
}
