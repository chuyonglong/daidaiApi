package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
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

func TestChannelGetKeysStripsCompatibleMultiKeyNumbers(t *testing.T) {
	channel := &Channel{
		Key: "1:sk-one\n2： sk-two\nsk-legacy\nbad-prefix:value",
	}

	require.Equal(t, []string{"sk-one", "sk-two", "sk-legacy", "bad-prefix:value"}, channel.GetKeys())
}

func TestFormatMultiKeyLinesNumbersKeys(t *testing.T) {
	lines := FormatMultiKeyLines([]string{"sk-one", " 2:sk-two ", "", "3： sk-three"})

	require.Equal(t, "1:sk-one\n2:sk-two\n3:sk-three", lines)
}

func TestGetNextEnabledKeySkipsDisabledNumberedKeys(t *testing.T) {
	channel := &Channel{
		Key: "1:sk-disabled\n2:sk-enabled",
		ChannelInfo: ChannelInfo{
			IsMultiKey:         true,
			MultiKeySize:       2,
			MultiKeyMode:       constant.MultiKeyModeRandom,
			MultiKeyStatusList: map[int]int{0: common.ChannelStatusAutoDisabled},
		},
	}

	key, index, err := channel.GetNextEnabledKey()

	require.Nil(t, err)
	require.Equal(t, "sk-enabled", key)
	require.Equal(t, 1, index)
}
