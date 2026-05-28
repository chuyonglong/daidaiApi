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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Table,
  Spin,
  Button,
  Typography,
  Empty,
  Input,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../../../helpers';
import { MODEL_TABLE_PAGE_SIZE } from '../../../../constants';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const BatchAddModelsModal = ({ visible, onClose, vendorId, onSuccess, t }) => {
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [missingModels, setMissingModels] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(MODEL_TABLE_PAGE_SIZE);
  const [selectedModelNames, setSelectedModelNames] = useState([]);
  const isMobile = useIsMobile();

  const fetchMissing = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/models/missing');
      if (res.data.success) {
        setMissingModels(res.data.data || []);
      } else {
        showError(res.data.message);
      }
    } catch (_) {
      showError(t('获取未配置模型失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (visible) {
      fetchMissing();
      setSearchKeyword('');
      setCurrentPage(1);
      setPageSize(MODEL_TABLE_PAGE_SIZE);
      setSelectedModelNames([]);
    } else {
      setMissingModels([]);
    }
  }, [visible]);

  const filteredModels = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return missingModels;
    return missingModels.filter((model) =>
      model.toLowerCase().includes(keyword),
    );
  }, [missingModels, searchKeyword]);

  const dataSource = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredModels.slice(start, start + pageSize).map((model) => ({
      model,
      key: model,
    }));
  }, [filteredModels, currentPage, pageSize]);

  const handleAdd = async () => {
    if (!vendorId || selectedModelNames.length === 0) return;
    setAdding(true);
    try {
      const res = await API.post('/api/models/batch', {
        vendor_id: Number(vendorId),
        model_names: selectedModelNames,
      });
      if (res.data.success) {
        const created = res.data.data?.created_count || 0;
        const skipped = res.data.data?.skipped_count || 0;
        showSuccess(
          t('已创建 {{created}} 个模型，跳过 {{skipped}} 个', {
            created,
            skipped,
          }),
        );
        onSuccess?.();
        onClose();
      } else {
        showError(res.data.message || t('添加模型失败'));
      }
    } catch (error) {
      showError(error.response?.data?.message || t('添加模型失败'));
    }
    setAdding(false);
  };

  const columns = [
    {
      title: t('模型名称'),
      dataIndex: 'model',
      render: (text) => (
        <div className='flex items-center'>
          <Typography.Text strong>{text}</Typography.Text>
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <div className='flex items-center gap-2'>
          <Typography.Text
            strong
            className='!text-[var(--semi-color-text-0)] !text-base'
          >
            {t('未配置的模型列表')}
          </Typography.Text>
          <Typography.Text type='tertiary' size='small'>
            {t('共')} {missingModels.length} {t('个未配置模型')}
          </Typography.Text>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      size={isMobile ? 'full-width' : 'medium'}
      className='!rounded-lg'
      footer={
        <div className='flex justify-end gap-2'>
          <Button onClick={onClose} disabled={adding}>
            {t('取消')}
          </Button>
          <Button
            type='primary'
            icon={<IconPlus />}
            loading={adding}
            disabled={selectedModelNames.length === 0 || !vendorId}
            onClick={handleAdd}
          >
            {t('添加')} {selectedModelNames.length} {t('个模型')}
          </Button>
        </div>
      }
    >
      <Spin spinning={loading}>
        {missingModels.length === 0 && !loading ? (
          <Empty
            image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
            darkModeImage={
              <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
            }
            description={t('暂无缺失模型')}
            style={{ padding: 30 }}
          />
        ) : (
          <div className='missing-models-content'>
            <div className='flex items-center justify-between gap-2 w-full mb-4'>
              <Input
                placeholder={t('搜索模型...')}
                value={searchKeyword}
                onChange={(v) => {
                  setSearchKeyword(v);
                  setCurrentPage(1);
                }}
                className='!w-full'
                prefix={<IconSearch />}
                showClear
              />
            </div>

            {filteredModels.length > 0 ? (
              <Table
                columns={columns}
                dataSource={dataSource}
                rowKey='key'
                rowSelection={{
                  selectedRowKeys: selectedModelNames,
                  onChange: (keys) => setSelectedModelNames(keys),
                }}
                pagination={{
                  currentPage,
                  pageSize,
                  total: filteredModels.length,
                  showSizeChanger: true,
                  pageSizeOpts: PAGE_SIZE_OPTIONS,
                  onPageChange: (page) => setCurrentPage(page),
                  onPageSizeChange: (size) => {
                    setPageSize(size);
                    setCurrentPage(1);
                  },
                }}
                size='small'
              />
            ) : (
              <Empty
                image={
                  <IllustrationNoResult style={{ width: 100, height: 100 }} />
                }
                darkModeImage={
                  <IllustrationNoResultDark
                    style={{ width: 100, height: 100 }}
                  />
                }
                description={
                  searchKeyword ? t('未找到匹配的模型') : t('暂无缺失模型')
                }
                style={{ padding: 20 }}
              />
            )}
          </div>
        )}
      </Spin>
    </Modal>
  );
};

export default BatchAddModelsModal;
