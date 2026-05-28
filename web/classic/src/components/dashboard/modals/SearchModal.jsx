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
import { API, timestamp2string } from '../../../helpers';

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
  const userSearchTimerRef = useRef(null);
  const userSearchSeqRef = useRef(0);
  const [selectedQuickRange, setSelectedQuickRange] = useState(null);
  const [userOptions, setUserOptions] = useState([]);
  const [userSearching, setUserSearching] = useState(false);

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

  const mapUserToOption = (user) => ({
    value: user.username,
    label: user.username,
    displayName: user.display_name,
    email: user.email,
    id: user.id,
  });

  const renderUserOption = (item) => (
    <div className='flex flex-col py-1'>
      <span className='font-medium'>{item.label}</span>
      <span className='text-xs text-gray-500'>
        {[item.displayName, item.email, item.id ? `ID: ${item.id}` : '']
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  );

  const searchUserOptions = useCallback(
    (keyword) => {
      const nextKeyword = String(keyword || '').trim();
      handleInputChange(keyword || '', 'username');

      if (userSearchTimerRef.current) {
        clearTimeout(userSearchTimerRef.current);
      }

      if (!nextKeyword) {
        userSearchSeqRef.current += 1;
        setUserOptions([]);
        setUserSearching(false);
        return;
      }

      const seq = userSearchSeqRef.current + 1;
      userSearchSeqRef.current = seq;
      setUserSearching(true);
      userSearchTimerRef.current = setTimeout(async () => {
        try {
          const res = await API.get('/api/user/search', {
            params: {
              keyword: nextKeyword,
              p: 1,
              page_size: 10,
            },
          });
          if (seq !== userSearchSeqRef.current) return;
          const users = res?.data?.success ? res.data.data?.items || [] : [];
          setUserOptions(
            users.map(mapUserToOption).filter((item) => item.value),
          );
        } catch (error) {
          if (seq === userSearchSeqRef.current) {
            setUserOptions([]);
          }
        } finally {
          if (seq === userSearchSeqRef.current) {
            setUserSearching(false);
          }
        }
      }, 300);
    },
    [handleInputChange],
  );

  const handleUserChange = (value) => {
    handleInputChange(value || '', 'username');
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

  useEffect(() => {
    return () => {
      if (userSearchTimerRef.current) {
        clearTimeout(userSearchTimerRef.current);
      }
    };
  }, []);

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
          createFormField(Form.AutoComplete, {
            field: 'username',
            label: t('用户名称'),
            value: username,
            placeholder: t('可选值'),
            name: 'username',
            data: userOptions,
            renderItem: renderUserOption,
            renderSelectedItem: (item) => item.value,
            showClear: true,
            loading: userSearching,
            onSearch: searchUserOptions,
            onChange: handleUserChange,
            onClear: () => {
              userSearchSeqRef.current += 1;
              setUserOptions([]);
              setUserSearching(false);
              handleUserChange('');
            },
          })}
      </Form>
    </Modal>
  );
};

export default SearchModal;
