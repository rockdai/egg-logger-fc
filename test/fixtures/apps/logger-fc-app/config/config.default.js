'use strict';

module.exports = () => {
  return {
    keys: 'test-keys',
    loggerFC: {
      extraFields: ctx => ({ tenantId: ctx.get('x-tenant-id') || undefined }),
    },
  };
};
