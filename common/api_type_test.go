package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestChannelType2APITypeMapsXiaomiToOpenAI(t *testing.T) {
	apiType, ok := ChannelType2APIType(constant.ChannelTypeXiaomi)
	require.True(t, ok)
	require.Equal(t, constant.APITypeOpenAI, apiType)
}
