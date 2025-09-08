'use client';

import { useState } from 'react';
import { db } from '@/lib/db';
import { type AppSchema } from '@/instant.schema';
import { id, InstaQLEntity } from '@instantdb/react';

type Post = InstaQLEntity<AppSchema, 'posts', { comments: {} }>;
type Comment = InstaQLEntity<AppSchema, 'comments'>;

function App() {
  const localId = db.useLocalId('guest');
  const [username, setUsername] = useState('');
  const [selectedPost, setSelectedPost] = useState<string | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);

  const { isLoading, error, data } = db.useQuery({
    posts: {
      $: { order: { serverCreatedAt: 'desc' } },
      comments: {}
    }
  });

  if (isLoading) return null;
  if (error) return <div className="text-red-500 p-4">Error: {error.message}</div>;

  const posts = data?.posts || [];
  const currentUsername = username || localId?.slice(0, 8) || 'anon';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-300 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-2 py-3 flex items-center justify-between">
          <h1 className="text-md font-bold text-orange-500">InstaReddit</h1>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Set username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="px-2 py-1 text-sm border rounded"
            />
            <button
              onClick={() => setShowNewPost(true)}
              className="px-4 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              New Post
            </button>
          </div>
        </div>
      </header>

      {/* Post List */}
      <main className="max-w-3xl mx-auto px-4 py-4">
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={currentUsername}
              onClick={() => setSelectedPost(post.id)}
            />
          ))}
        </div>
      </main>

      {/* New Post Modal */}
      {showNewPost && (
        <Modal onClose={() => setShowNewPost(false)}>
          <NewPostForm
            authorId={currentUsername}
            onSubmit={() => setShowNewPost(false)}
          />
        </Modal>
      )}

      {/* Post Detail Modal */}
      {selectedPost && (
        <Modal onClose={() => setSelectedPost(null)}>
          <PostDetail
            postId={selectedPost}
            currentUser={currentUsername}
          />
        </Modal>
      )}
    </div>
  );
}

function PostCard({ post, currentUser, onClick }: {
  post: Post;
  currentUser: string;
  onClick: () => void;
}) {
  const votes = getVotes(post);
  const userVote = getUserVote(post, currentUser);

  return (
    <div className="bg-white rounded border border-gray-300 p-4 cursor-pointer hover:border-gray-400" onClick={onClick}>
      <div className="flex gap-3">
        <VoteButtons
          votes={votes}
          userVote={userVote}
          onVote={(type) => handlePostVote(post.id, currentUser, type)}
        />
        <div className="flex-1">
          <h2 className="font-semibold text-lg mb-1">{post.title}</h2>
          <p className="text-gray-600 text-sm mb-2 line-clamp-2">{post.body}</p>
          <div className="text-xs text-gray-500">
            by {post.authorId} • {formatTime(post.timestamp)} • {post.comments?.length || 0} comments
          </div>
        </div>
      </div>
    </div>
  );
}

function PostDetail({ postId, currentUser }: { postId: string; currentUser: string }) {
  const { data } = db.useQuery({
    posts: {
      $: { where: { id: postId } },
      comments: {}
    }
  });

  const post = data?.posts?.[0];
  if (!post) return null;

  const votes = getVotes(post);
  const userVote = getUserVote(post, currentUser);
  const topLevelComments = (post.comments || []).filter(c => !c.parentCommentId);

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <div className="p-4 border-b">
        <div className="flex gap-3">
          <VoteButtons
            votes={votes}
            userVote={userVote}
            onVote={(type) => handlePostVote(post.id, currentUser, type)}
          />
          <div className="flex-1">
            <h2 className="font-semibold text-xl mb-2">{post.title}</h2>
            <p className="text-gray-700 mb-3">{post.body}</p>
            <div className="text-xs text-gray-500">
              by {post.authorId} • {formatTime(post.timestamp)}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <NewCommentForm postId={post.id} authorId={currentUser} />
        <div className="mt-4 space-y-3">
          {topLevelComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              allComments={post.comments || []}
              currentUser={currentUser}
              postId={post.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CommentThread({
  comment,
  allComments,
  currentUser,
  postId
}: {
  comment: Comment;
  allComments: Comment[];
  currentUser: string;
  postId: string;
}) {
  const [showReply, setShowReply] = useState(false);
  const votes = getVotes(comment);
  const userVote = getUserVote(comment, currentUser);
  const replies = allComments.filter(c => c.parentCommentId === comment.id);

  return (
    <div className="border-l-2 border-gray-200 pl-3">
      <div className="flex gap-2">
        <VoteButtons
          votes={votes}
          userVote={userVote}
          onVote={(type) => handleCommentVote(comment.id, currentUser, type)}
          small
        />
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-1">
            {comment.authorId} • {formatTime(comment.timestamp)}
          </div>
          <p className="text-sm">{comment.text}</p>
          <button
            onClick={() => setShowReply(!showReply)}
            className="text-xs text-blue-500 hover:underline mt-1"
          >
            reply
          </button>
          {showReply && (
            <div className="mt-2">
              <NewCommentForm
                postId={postId}
                authorId={currentUser}
                parentCommentId={comment.id}
                onSubmit={() => setShowReply(false)}
              />
            </div>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <div className="mt-3 space-y-3">
          {replies.map((reply) => (
            <div key={reply.id} className="pl-3">
              <div className="flex gap-2">
                <VoteButtons
                  votes={getVotes(reply)}
                  userVote={getUserVote(reply, currentUser)}
                  onVote={(type) => handleCommentVote(reply.id, currentUser, type)}
                  small
                />
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">
                    {reply.authorId} • {formatTime(reply.timestamp)}
                  </div>
                  <p className="text-sm">{reply.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VoteButtons({
  votes,
  userVote,
  onVote,
  small = false
}: {
  votes: number;
  userVote: 'up' | 'down' | null;
  onVote: (type: 'up' | 'down') => void;
  small?: boolean;
}) {
  const size = small ? 'w-4 h-4' : 'w-5 h-5';
  const textSize = small ? 'text-xs' : 'text-sm';

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onVote('up'); }}
        className={`${size} ${userVote === 'up' ? 'text-orange-500' : 'text-gray-400 hover:text-orange-500'}`}
      >
        ▲
      </button>
      <span className={`${textSize} font-semibold`}>{votes}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onVote('down'); }}
        className={`${size} ${userVote === 'down' ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}
      >
        ▼
      </button>
    </div>
  );
}

function NewPostForm({ authorId, onSubmit }: { authorId: string; onSubmit: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    db.transact(
      db.tx.posts[id()].update({
        title: title.trim(),
        body: body.trim(),
        authorId,
        timestamp: Date.now(),
        upvotes: [],
        downvotes: []
      })
    );
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <h2 className="text-lg font-semibold mb-3">Create Post</h2>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 border rounded mb-3"
        autoFocus
      />
      <textarea
        placeholder="Text (optional)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full px-3 py-2 border rounded mb-3 h-32 resize-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
        >
          Post
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="px-4 py-2 border rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function NewCommentForm({
  postId,
  authorId,
  parentCommentId,
  onSubmit
}: {
  postId: string;
  authorId: string;
  parentCommentId?: string;
  onSubmit?: () => void;
}) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const commentId = id();
    db.transact([
      db.tx.comments[commentId].update({
        text: text.trim(),
        authorId,
        timestamp: Date.now(),
        upvotes: [],
        downvotes: [],
        ...(parentCommentId && { parentCommentId })
      }),
      db.tx.comments[commentId].link({ post: postId })
    ]);
    setText('');
    onSubmit?.();
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        placeholder={parentCommentId ? "Write a reply..." : "Write a comment..."}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="flex-1 px-3 py-2 border rounded text-sm"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
      >
        {parentCommentId ? 'Reply' : 'Comment'}
      </button>
    </form>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="relative">
          <button
            onClick={onClose}
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

// Helper functions
function getVotes(item: Post | Comment): number {
  const upvotes = (item.upvotes as string[]) || [];
  const downvotes = (item.downvotes as string[]) || [];
  return upvotes.length - downvotes.length;
}

function getUserVote(item: Post | Comment, userId: string): 'up' | 'down' | null {
  const upvotes = (item.upvotes as string[]) || [];
  const downvotes = (item.downvotes as string[]) || [];

  if (upvotes.includes(userId)) return 'up';
  if (downvotes.includes(userId)) return 'down';
  return null;
}

async function handlePostVote(postId: string, userId: string, type: 'up' | 'down') {
  const { data } = await db.queryOnce({ posts: { $: { where: { id: postId } } } });
  const post = data?.posts?.[0];
  if (!post) return;

  let upvotes = (post.upvotes as string[]) || [];
  let downvotes = (post.downvotes as string[]) || [];

  const wasUpvoted = upvotes.includes(userId);
  const wasDownvoted = downvotes.includes(userId);

  upvotes = upvotes.filter(id => id !== userId);
  downvotes = downvotes.filter(id => id !== userId);

  if (type === 'up' && !wasUpvoted) {
    upvotes.push(userId);
  } else if (type === 'down' && !wasDownvoted) {
    downvotes.push(userId);
  }

  db.transact(
    db.tx.posts[postId].update({ upvotes, downvotes })
  );
}

async function handleCommentVote(commentId: string, userId: string, type: 'up' | 'down') {
  const { data } = await db.queryOnce({ comments: { $: { where: { id: commentId } } } });
  const comment = data?.comments?.[0];
  if (!comment) return;

  let upvotes = (comment.upvotes as string[]) || [];
  let downvotes = (comment.downvotes as string[]) || [];

  const wasUpvoted = upvotes.includes(userId);
  const wasDownvoted = downvotes.includes(userId);

  upvotes = upvotes.filter(id => id !== userId);
  downvotes = downvotes.filter(id => id !== userId);

  if (type === 'up' && !wasUpvoted) {
    upvotes.push(userId);
  } else if (type === 'down' && !wasDownvoted) {
    downvotes.push(userId);
  }

  db.transact(
    db.tx.comments[commentId].update({ upvotes, downvotes })
  );
}

function formatTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default App;
