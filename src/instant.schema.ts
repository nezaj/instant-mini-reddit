// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      body: i.string(),
      authorId: i.string(),
      timestamp: i.number().indexed(),
      upvotes: i.json().optional(),
      downvotes: i.json().optional(),
    }),
    comments: i.entity({
      text: i.string(),
      authorId: i.string(),
      timestamp: i.number().indexed(),
      upvotes: i.json().optional(),
      downvotes: i.json().optional(),
      parentCommentId: i.string().optional(),
    }),
  },
  links: {
    postComments: {
      forward: { on: 'comments', has: 'one', label: 'post' },
      reverse: { on: 'posts', has: 'many', label: 'comments' },
    },
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema { }
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
