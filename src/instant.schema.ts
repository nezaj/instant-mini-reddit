// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      body: i.string(),
      authorId: i.string(),
      timestamp: i.number().indexed(),
    }),
    comments: i.entity({
      text: i.string(),
      authorId: i.string(),
      timestamp: i.number().indexed(),
      parentCommentId: i.string().optional(),
    }),
    votes: i.entity({
      userId: i.string(),
      voteType: i.string(),
    }),
  },
  links: {
    postComments: {
      forward: { on: 'comments', has: 'one', label: 'post' },
      reverse: { on: 'posts', has: 'many', label: 'comments' },
    },
    votePost: {
      forward: { on: 'votes', has: 'one', label: 'post' },
      reverse: { on: 'posts', has: 'many', label: 'votes' },
    },
    voteComment: {
      forward: { on: 'votes', has: 'one', label: 'comment' },
      reverse: { on: 'comments', has: 'many', label: 'votes' },
    },
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema { }
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
