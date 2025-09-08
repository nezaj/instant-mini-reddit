'use client';

import { useState } from 'react';
import { init, id, InstaQLEntity, i } from '@instantdb/react';

// ============================================================================
// INSTANT SETUP - Initialize connection and define schema
// ============================================================================

// Define schema with posts, comments, and votes
const schema = i.schema({
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

// Initialize InstantDB connection
const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID!;
const db = init({ appId: APP_ID, schema });

// Type definitions from schema
type Schema = typeof schema;
type Post = InstaQLEntity<Schema, 'posts', { comments: {}; votes: {} }>;
type Comment = InstaQLEntity<Schema, 'comments', { votes: {} }>;
type Vote = InstaQLEntity<Schema, 'votes'>;

// ============================================================================
// INSTANT DB OPERATIONS - Real-time, reactive, and multiplayer by default
// ============================================================================

// Create a new post - instantly synced across all clients
function createPost(title: string, body: string, authorId: string) {
  db.transact(
    db.tx.posts[id()].create({
      title,
      body,
      authorId,
      timestamp: Date.now()
    })
  );
}

// Create a comment with automatic relationship linking
function createComment(
  text: string,
  postId: string,
  authorId: string,
  parentCommentId?: string
) {
  const commentId = id();
  db.transact([
    db.tx.comments[commentId].create({
      text,
      authorId,
      timestamp: Date.now(),
      ...(parentCommentId && { parentCommentId })
    }),
    // Link comment to post - InstantDB handles the relationship
    db.tx.comments[commentId].link({ post: postId })
  ]);
}

// Handle creating, updating, or removing a vote
function handleVote(
  targetId: string,
  userId: string,
  voteType: 'up' | 'down',
  targetType: 'post' | 'comment',
  existingVote?: Vote
) {
  if (existingVote) {
    if (existingVote.voteType === voteType) {
      db.transact(db.tx.votes[existingVote.id].delete());
    } else {
      db.transact(db.tx.votes[existingVote.id].update({ voteType }));
    }
  } else {
    const voteId = id();
    const linkKey = targetType === 'post' ? 'post' : 'comment';
    db.transact([
      db.tx.votes[voteId].create({ userId, voteType }).link({ [linkKey]: targetId })
    ]);
  }
}

// ============================================================================
// MAIN APP - Demonstrates real-time queries and local-first identity
// ============================================================================

function App() {
  // Local-first user identity - persists across sessions
  const localId = db.useLocalId('guest');
  
  const [username, setUsername] = useState('');
  const [selectedPost, setSelectedPost] = useState<string | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);

  // Real-time query - automatically updates when any client makes changes
  const { isLoading, error, data } = db.useQuery({
    posts: {
      $: { order: { timestamp: 'desc' } },
      comments: {
        votes: {}  // Nested relationship loading
      },
      votes: {}  // Load votes with posts for instant vote counts
    }
  });

  if (isLoading) return null;
  if (error) return <div className="text-red-500 p-4">Error: {error.message}</div>;
  
  const posts = data?.posts || [];
  const currentUsername = username || localId?.slice(0, 8) || 'anon';

  return (
    <div className="min-h-screen bg-gray-100">
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

      {showNewPost && (
        <Modal onClose={() => setShowNewPost(false)}>
          <NewPostForm
            authorId={currentUsername}
            onSubmit={() => setShowNewPost(false)}
          />
        </Modal>
      )}

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

function PostDetail({ postId, currentUser }: { postId: string; currentUser: string }) {
  // Focused query for single post with all relationships
  const { data } = db.useQuery({
    posts: {
      $: { where: { id: postId } },
      comments: {
        votes: {}  // Load votes for each comment
      },
      votes: {}  // Load votes for the post
    }
  });

  const post = data?.posts?.[0];
  if (!post) return null;

  const votes = getVoteCount(post.votes || []);
  const userVote = getUserVote(post.votes || [], currentUser);
  const topLevelComments = (post.comments || []).filter(c => !c.parentCommentId);

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <div className="p-4 border-b">
        <div className="flex gap-3">
          <VoteButtons
            votes={votes}
            userVote={userVote}
            onVote={(type, existingVote) => handleVote(post.id, currentUser, type, 'post', existingVote)}
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

// ============================================================================
// UI COMPONENTS - Presentation layer that reacts to InstantDB state
// ============================================================================

function PostCard({ post, currentUser, onClick }: { 
  post: Post; 
  currentUser: string;
  onClick: () => void;
}) {
  const votes = getVoteCount(post.votes || []);
  const userVote = getUserVote(post.votes || [], currentUser);

  return (
    <div className="bg-white rounded border border-gray-300 p-4 cursor-pointer hover:border-gray-400" onClick={onClick}>
      <div className="flex gap-3">
        <VoteButtons
          votes={votes}
          userVote={userVote}
          onVote={(type, existingVote) => handleVote(post.id, currentUser, type, 'post', existingVote)}
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
  const votes = getVoteCount(comment.votes || []);
  const userVote = getUserVote(comment.votes || [], currentUser);
  const replies = allComments.filter(c => c.parentCommentId === comment.id);

  return (
    <div className="border-l-2 border-gray-200 pl-3">
      <div className="flex gap-2">
        <VoteButtons
          votes={votes}
          userVote={userVote}
          onVote={(type, existingVote) => handleVote(comment.id, currentUser, type, 'comment', existingVote)}
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
                  votes={getVoteCount(reply.votes || [])}
                  userVote={getUserVote(reply.votes || [], currentUser)}
                  onVote={(type, existingVote) => handleVote(reply.id, currentUser, type, 'comment', existingVote)}
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
  userVote: Vote | null;
  onVote: (type: 'up' | 'down', existingVote?: Vote) => void;
  small?: boolean;
}) {
  const size = small ? 'w-4 h-4' : 'w-5 h-5';
  const textSize = small ? 'text-xs' : 'text-sm';
  const voteType = userVote?.voteType;

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onVote('up', userVote || undefined); }}
        className={`${size} ${voteType === 'up' ? 'text-orange-500' : 'text-gray-400 hover:text-orange-500'}`}
      >
        ▲
      </button>
      <span className={`${textSize} font-semibold`}>{votes}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onVote('down', userVote || undefined); }}
        className={`${size} ${voteType === 'down' ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}
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
    
    createPost(title.trim(), body.trim(), authorId);
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
    
    createComment(text.trim(), postId, authorId, parentCommentId);
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

// ============================================================================
// UTILITY FUNCTIONS - Pure functions for data transformation
// ============================================================================

function getVoteCount(votes: Vote[]): number {
  const upvotes = votes.filter(v => v.voteType === 'up').length;
  const downvotes = votes.filter(v => v.voteType === 'down').length;
  return upvotes - downvotes;
}

function getUserVote(votes: Vote[], userId: string): Vote | null {
  return votes.find(v => v.userId === userId) || null;
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