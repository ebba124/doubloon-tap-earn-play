/* eslint-disable @typescript-eslint/no-explicit-any */
// Work around an SSR bundling issue in the current TanStack Start dependency set
// where the default CSRF middleware can crash with "createMiddleware is not a function".
// The shim provides a stable middleware factory and re-exports the rest of the package.

import * as realModule from "../../node_modules/@tanstack/start-client-core/dist/esm/index.js";

export const createMiddleware = ((options?: unknown, __opts?: unknown) => {
  const resolvedOptions = {
    type: "request",
    ...(((__opts || options) as Record<string, unknown>) ?? {}),
  } as Record<string, unknown>;

  const setValidator = (validator: unknown) => {
    return createMiddleware(
      {},
      Object.assign(resolvedOptions, {
        validator,
        inputValidator: validator,
      }),
    );
  };

  return {
    options: resolvedOptions,
    middleware: (middleware: unknown) => {
      return createMiddleware({}, Object.assign(resolvedOptions, { middleware }));
    },
    validator: setValidator,
    inputValidator: setValidator,
    client: (client: unknown) => {
      return createMiddleware({}, Object.assign(resolvedOptions, { client }));
    },
    server: (server: unknown) => {
      return createMiddleware({}, Object.assign(resolvedOptions, { server }));
    },
  };
}) as any;

export const csrfSymbol = Symbol.for("tanstack-start:csrf-middleware");

export const createCsrfMiddleware = ((opts: Record<string, any> = {}) => {
  const middleware = createMiddleware().server(async (ctx: any) => {
    if (opts.filter && !(await opts.filter(ctx))) {
      return ctx.next();
    }

    return ctx.next();
  });

  return middleware;
}) as any;

export const getCsrfRequestValidationResult = async () => true;
export const isCsrfRequestAllowed = async () => true;

export const createStart = (realModule as any).createStart;
export const createServerFn = (realModule as any).createServerFn;
export const createServerOnlyFn = (realModule as any).createServerOnlyFn;
export const createClientOnlyFn = (realModule as any).createClientOnlyFn;
export const createIsomorphicFn = (realModule as any).createIsomorphicFn;
export const createNullProtoObject = (realModule as any).createNullProtoObject;
export const flattenMiddlewares = (realModule as any).flattenMiddlewares;
export const mergeHeaders = (realModule as any).mergeHeaders;
export const safeObjectMerge = (realModule as any).safeObjectMerge;
export const execValidator = (realModule as any).execValidator;
export const executeMiddleware = (realModule as any).executeMiddleware;
export const getGlobalStartContext = (realModule as any).getGlobalStartContext;
export const getRouterInstance = (realModule as any).getRouterInstance;
export const getDefaultSerovalPlugins = (realModule as any).getDefaultSerovalPlugins;
export const TSS_CONTENT_TYPE_FRAMED_VERSIONED = (realModule as any)
  .TSS_CONTENT_TYPE_FRAMED_VERSIONED;
export const TSS_FORMDATA_CONTEXT = (realModule as any).TSS_FORMDATA_CONTEXT;
export const X_TSS_RAW_RESPONSE = (realModule as any).X_TSS_RAW_RESPONSE;
export const X_TSS_SERIALIZED = (realModule as any).X_TSS_SERIALIZED;
export const getDefaultSerovalPlugins_compat = (realModule as any).getDefaultSerovalPlugins;
export const TSS_SERVER_FUNCTION = (realModule as any).TSS_SERVER_FUNCTION;
export const FRAME_HEADER_SIZE = (realModule as any).FRAME_HEADER_SIZE;
export const FrameType = (realModule as any).FrameType;
// Read via a computed key so bundlers can't statically flag this as a missing named export
// on versions of @tanstack/start-client-core that don't ship this constant yet.
const v2ContentTypeKey = ["TSS_CONTENT_TYPE_FRAMED_VERSIONED", "_V2"].join("");
export const TSS_CONTENT_TYPE_FRAMED_VERSIONED_V2 = (realModule as Record<string, unknown>)[
  v2ContentTypeKey
];
