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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Form, Button } from '@douyinfe/semi-ui';
import { timestamp2string } from '../../../helpers';

const getStartOfDay = (date = new Date()) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const getEndWithCurrentHourBuffer = (date = new Date()) => {
  return new Date(date.getTime() + 60 * 60 * 1000);
};

const getRollingRange = (days) => {
  const end = getEndWithCurrentHourBuffer();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
};

const QUICK_RANGES = [
  {
    key: 'today',
    label: '今天',
    getRange: () => {
      const now = new Date();
      return {
        start: getStartOfDay(now),
        end: getEndWithCurrentHourBuffer(now),
      };
    },
  },
  {
    key: 'thisMonth',
    label: '本月',
    getRange: () => {
      const now = new Date();
      return {
        start: getStartOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: getEndWithCurrentHourBuffer(now),
      };
    },
  },
  {
    key: 'last7Days',
    label: '近 7 天',
    getRange: () => getRollingRange(7),
  },
  {
    key: 'last30Days',
    label: '近 30 天',
    getRange: () => getRollingRange(30),
  },
];

const SearchModal = ({
  searchModalVisible,
  handleSearchConfirm,
  handleCloseModal,
  isMobile,
  isAdminUser,
  inputs,
  dataExportDefaultTime,
  timeOptions,
  handleInputChange,
  t,
}) => {
  const formApiRef = useRef(null);
  const [selectedQuickRange, setSelectedQuickRange] = useState(null);

  const FORM_FIELD_PROPS = {
    className: 'w-full mb-2 !rounded-lg',
  };

  const createFormField = (Component, props) => (
    <Component {...FORM_FIELD_PROPS} {...props} />
  );

  const { start_timestamp, end_timestamp, username } = inputs;

  const syncFormValues = useCallback((nextValues) => {
    formApiRef.current?.setValues(nextValues);
  }, []);

  const updateDateRange = (start, end) => {
    const nextValues = {
      start_timestamp: timestamp2string(start.getTime() / 1000),
      end_timestamp: timestamp2string(end.getTime() / 1000),
    };
    handleInputChange(nextValues.start_timestamp, 'start_timestamp');
    handleInputChange(nextValues.end_timestamp, 'end_timestamp');
    syncFormValues(nextValues);
  };

  const handleQuickRange = (range) => {
    const { start, end } = range.getRange();
    updateDateRange(start, end);
    setSelectedQuickRange(range.key);
  };

  const handleDateChange = (value, name) => {
    setSelectedQuickRange(null);
    handleInputChange(value, name);
  };

  const handleModalClose = () => {
    setSelectedQuickRange(null);
    handleCloseModal();
  };

  useEffect(() => {
    if (!searchModalVisible) return;
    syncFormValues({
      start_timestamp,
      end_timestamp,
      data_export_default_time: dataExportDefaultTime,
      username,
    });
  }, [
    searchModalVisible,
    start_timestamp,
    end_timestamp,
    dataExportDefaultTime,
    username,
    syncFormValues,
  ]);

  return (
    <Modal
      title={t('搜索条件')}
      visible={searchModalVisible}
      onOk={handleSearchConfirm}
      onCancel={handleModalClose}
      closeOnEsc={true}
      size={isMobile ? 'full-width' : 'small'}
      centered
    >
      <Form
        getFormApi={(api) => {
          formApiRef.current = api;
        }}
        layout='vertical'
        className='w-full'
      >
        <div className='mb-3'>
          <div className='mb-2 text-sm font-medium'>{t('快捷日期')}</div>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {QUICK_RANGES.map((range) => (
              <Button
                key={range.key}
                type={selectedQuickRange === range.key ? 'primary' : 'tertiary'}
                theme={selectedQuickRange === range.key ? 'solid' : 'light'}
                onClick={() => handleQuickRange(range)}
                className='!rounded-lg'
              >
                {t(range.label)}
              </Button>
            ))}
          </div>
        </div>

        {createFormField(Form.DatePicker, {
          field: 'start_timestamp',
          label: t('起始时间'),
          initValue: start_timestamp,
          value: start_timestamp,
          type: 'dateTime',
          name: 'start_timestamp',
          onChange: (value) => handleDateChange(value, 'start_timestamp'),
        })}

        {createFormField(Form.DatePicker, {
          field: 'end_timestamp',
          label: t('结束时间'),
          initValue: end_timestamp,
          value: end_timestamp,
          type: 'dateTime',
          name: 'end_timestamp',
          onChange: (value) => handleDateChange(value, 'end_timestamp'),
        })}

        {createFormField(Form.Select, {
          field: 'data_export_default_time',
          label: t('时间粒度'),
          initValue: dataExportDefaultTime,
          placeholder: t('时间粒度'),
          name: 'data_export_default_time',
          optionList: timeOptions,
          onChange: (value) =>
            handleInputChange(value, 'data_export_default_time'),
        })}

        {isAdminUser &&
          createFormField(Form.Input, {
            field: 'username',
            label: t('用户名称'),
            value: username,
            placeholder: t('可选值'),
            name: 'username',
            onChange: (value) => handleInputChange(value, 'username'),
          })}
      </Form>
    </Modal>
  );
};

export default SearchModal;
