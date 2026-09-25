export type ExposureState = 'unfilterable' | 'readonly' | 'guarded' | 'hidden';

export type ExposureOperation = 'findMany' | 'findUnique' | 'findFirst' | 'count' | 'createOne' | 'createMany' | 'updateOne' | 'updateMany' | 'upsertOne' | 'deleteOne' | 'deleteMany';

export type ExposureOperations =
  | ExposureOperation[]
  | ({ inherit?: boolean } & Partial<Record<ExposureOperation, boolean | string | string[]>>);

// `crud.exposure` with the models and fields of your schema. In pothos.config.js:
//   /** @type {import('./exposure.types').ExposureConfig} */
export type ExposureConfig = {
  operations?: ExposureOperations;
  maxTake?: number;
  manifest?: { path: string };
  keepInputs?: string[];
  models?: {
    User?: {
      fields?: {
        id?: ExposureState | ExposureState[];
        email?: ExposureState | ExposureState[];
        passwordHash?: ExposureState | ExposureState[];
        phone?: ExposureState | ExposureState[];
        role?: ExposureState | ExposureState[];
        createdAt?: ExposureState | ExposureState[];
        posts?: ExposureState | ExposureState[];
        tokens?: ExposureState | ExposureState[];
      };
      operations?: ExposureOperations;
      maxTake?: number;
    };
    Post?: {
      fields?: {
        id?: ExposureState | ExposureState[];
        title?: ExposureState | ExposureState[];
        published?: ExposureState | ExposureState[];
        createdAt?: ExposureState | ExposureState[];
        author?: ExposureState | ExposureState[];
        authorId?: ExposureState | ExposureState[];
        comments?: ExposureState | ExposureState[];
      };
      operations?: ExposureOperations;
      maxTake?: number;
    };
    Comment?: {
      fields?: {
        id?: ExposureState | ExposureState[];
        body?: ExposureState | ExposureState[];
        post?: ExposureState | ExposureState[];
        postId?: ExposureState | ExposureState[];
      };
      operations?: ExposureOperations;
      maxTake?: number;
    };
    AuthToken?: {
      fields?: {
        id?: ExposureState | ExposureState[];
        token?: ExposureState | ExposureState[];
        user?: ExposureState | ExposureState[];
        userId?: ExposureState | ExposureState[];
      };
      operations?: ExposureOperations;
      maxTake?: number;
    };
    AuditLog?: {
      fields?: {
        id?: ExposureState | ExposureState[];
        action?: ExposureState | ExposureState[];
      };
      operations?: ExposureOperations;
      maxTake?: number;
    };
  };
};
