package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestChannelInfoScanTreatsEmptyValueAsDefault(t *testing.T) {
	var info ChannelInfo

	require.NoError(t, info.Scan([]byte("")))
	require.Equal(t, ChannelInfo{}, info)

	info = ChannelInfo{IsMultiKey: true, MultiKeySize: 3}
	require.NoError(t, info.Scan(nil))
	require.Equal(t, ChannelInfo{}, info)
}
