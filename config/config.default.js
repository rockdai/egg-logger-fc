'use strict';

// FC 3.0 stamps this header on every HTTP invocation.
// See: https://help.aliyun.com/zh/functioncompute/fc-3-0/user-guide/logging
exports.loggerFC = {
  requestIdHeader: 'x-fc-request-id',
  // Optional function to add app-specific fields from the request ctx.
  // Must return a plain object; thrown errors are swallowed so logging
  // never breaks the request flow.
  //
  //   extraFields: (ctx) => ({ traceId: ctx.get('x-trace-id') }),
  extraFields: null,
};
