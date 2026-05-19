/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useMemo, useState } from 'react';
import { Button, Modal, Space, TextArea, Typography } from '@douyinfe/semi-ui';
import { IconCode, IconCopy, IconSave } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../../helpers';

const { Text } = Typography;

const BATCH_CREATE_EXAMPLE = JSON.stringify(
  [
    {
      name: 'OpenAI A',
      type: 1,
      key: 'sk-...',
      base_url: 'https://api.example.com',
      models: 'gpt-4o,gpt-4o-mini',
      group: 'default',
    },
    {
      name: 'OpenAI B',
      type: 1,
      key: 'sk-...',
      base_url: '',
      models: 'gpt-4o',
      group: 'default',
      priority: 0,
      weight: 0,
    },
  ],
  null,
  2,
);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateBatchCreateJson(value) {
  if (!value.trim()) {
    return {
      error: {
        key: '请粘贴渠道 JSON 数组',
      },
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    return {
      error: {
        key: 'JSON 格式错误：{{message}}',
        values: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      error: {
        key: '顶层必须是 JSON 数组',
      },
    };
  }

  if (parsed.length === 0) {
    return {
      error: {
        key: '至少需要 1 条渠道',
      },
    };
  }

  for (const [index, item] of parsed.entries()) {
    const displayIndex = index + 1;

    if (!isRecord(item)) {
      return {
        error: {
          key: '第 {{index}} 项必须是对象',
          values: { index: displayIndex },
        },
      };
    }

    if (!String(item.name ?? '').trim()) {
      return {
        error: {
          key: '第 {{index}} 项缺少必填字段：{{field}}',
          values: { index: displayIndex, field: 'name' },
        },
      };
    }

    if (
      typeof item.type !== 'number' ||
      !Number.isFinite(item.type) ||
      item.type <= 0
    ) {
      return {
        error: {
          key: '第 {{index}} 项的渠道类型必须是正数',
          values: { index: displayIndex },
        },
      };
    }

    if (!String(item.key ?? '').trim()) {
      return {
        error: {
          key: '第 {{index}} 项缺少必填字段：{{field}}',
          values: { index: displayIndex, field: 'key' },
        },
      };
    }

    if (typeof item.models !== 'string' || !item.models.trim()) {
      return {
        error: {
          key: '第 {{index}} 项缺少必填字段：{{field}}',
          values: { index: displayIndex, field: 'models' },
        },
      };
    }

    if (
      item.base_url !== undefined &&
      item.base_url !== null &&
      typeof item.base_url !== 'string'
    ) {
      return {
        error: {
          key: '第 {{index}} 项的 API 地址必须是字符串',
          values: { index: displayIndex },
        },
      };
    }
  }

  return { channels: parsed };
}

const BatchCreateChannelsModal = ({ visible, onCancel, refresh }) => {
  const { t } = useTranslation();
  const [jsonValue, setJsonValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validation = useMemo(
    () => validateBatchCreateJson(jsonValue),
    [jsonValue],
  );
  const readyCount = validation.channels?.length || 0;
  const errorMessage = validation.error
    ? t(validation.error.key, validation.error.values)
    : '';

  const resetAndClose = () => {
    setJsonValue('');
    setSubmitting(false);
    onCancel();
  };

  const fillExample = () => {
    setJsonValue(BATCH_CREATE_EXAMPLE);
  };

  const formatJson = () => {
    if (!validation.channels) {
      showError(errorMessage);
      return;
    }
    setJsonValue(JSON.stringify(validation.channels, null, 2));
  };

  const submit = async () => {
    if (!validation.channels) {
      showError(errorMessage);
      return;
    }

    setSubmitting(true);
    try {
      const res = await API.post(
        '/api/channel/batch_create',
        validation.channels,
      );
      const { success, message, data } = res.data || {};

      if (success) {
        const count = data?.created_count ?? validation.channels.length;
        showSuccess(t('已批量创建 {{count}} 个渠道', { count }));
        await refresh();
        resetAndClose();
      } else {
        showError(message || t('批量创建渠道失败'));
      }
    } catch (error) {
      showError(
        error?.response?.data?.message ||
          error?.message ||
          t('批量创建渠道失败'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <IconCode />
          {t('批量创建渠道')}
        </Space>
      }
      visible={visible}
      onCancel={resetAndClose}
      onOk={submit}
      confirmLoading={submitting}
      okText={t('批量创建')}
      cancelText={t('取消')}
      width={760}
      maskClosable={!submitting}
    >
      <div className='flex flex-col gap-3'>
        <Text type='secondary'>
          {t(
            '粘贴 JSON 数组，一次创建多条完整渠道配置。每条渠道可单独设置 API 地址 base_url。',
          )}
        </Text>

        <Space wrap>
          <Button
            size='small'
            type='tertiary'
            icon={<IconCopy />}
            disabled={submitting}
            onClick={fillExample}
          >
            {t('填入示例')}
          </Button>
          <Button
            size='small'
            type='tertiary'
            icon={<IconSave />}
            disabled={submitting || !jsonValue.trim()}
            onClick={formatJson}
          >
            {t('格式化 JSON')}
          </Button>
          {readyCount > 0 ? (
            <Text type='success'>
              {t('已准备创建 {{count}} 个渠道', { count: readyCount })}
            </Text>
          ) : null}
        </Space>

        <TextArea
          autosize={{ minRows: 16, maxRows: 22 }}
          value={jsonValue}
          onChange={setJsonValue}
          placeholder={BATCH_CREATE_EXAMPLE}
          disabled={submitting}
          style={{ fontFamily: 'monospace' }}
        />

        <Text size='small' type='tertiary'>
          {t(
            '必填字段：name、type、key、models。API 地址使用 base_url，可留空。',
          )}
        </Text>
        <Text size='small' type='tertiary'>
          {t('提交后将按全量事务创建；任意一条失败会全部回滚。')}
        </Text>
        {jsonValue.trim() && errorMessage ? (
          <Text type='danger'>{errorMessage}</Text>
        ) : null}
      </div>
    </Modal>
  );
};

export default BatchCreateChannelsModal;
