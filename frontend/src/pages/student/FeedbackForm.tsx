import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionsApi, feedbackApi } from '../../lib/api';
import type { Session, FeedbackQuestion } from '../../lib/types';

export default function FeedbackForm() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<FeedbackQuestion[]>([]);
  const [answers, setAnswers] = useState<Map<string, number>>(new Map());
  const [overallRating, setOverallRating] = useState(3);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const [sessionData, questionsData] = await Promise.allSettled([
        sessionsApi.getById(sessionId),
        feedbackApi.getQuestions(),
      ]);

      if (sessionData.status === 'fulfilled') setSession(sessionData.value);
      if (questionsData.status === 'fulfilled') {
        setQuestions(questionsData.value);
        const initialAnswers = new Map<string, number>();
        questionsData.value.forEach((q) => initialAnswers.set(q.id, 3));
        setAnswers(initialAnswers);
      }
    } catch (err) {
      console.error('Failed to load feedback form:', err);
    } finally {
      setLoading(false);
    }
  };

  const setAnswerRating = (questionId: string, rating: number) => {
    setAnswers((prev) => new Map(prev).set(questionId, rating));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    setSubmitting(true);
    setError('');
    try {
      const answerArray = Array.from(answers.entries()).map(([questionId, rating]) => ({
        questionId,
        rating,
      }));

      await feedbackApi.create({
        sessionId,
        answers: answerArray,
        overallRating,
        comments: comments || undefined,
        isAnonymous: false,
      });

      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading feedback form...</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
          <h2 style={{ marginBottom: '8px' }}>Thank You!</h2>
          <p className="page-subtitle" style={{ marginBottom: '24px' }}>
            Your feedback has been submitted successfully.
          </p>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="empty-state">Session not found</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Session Feedback</h2>
        <p className="page-subtitle">Share your feedback for this session</p>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <strong>Session:</strong> {session.title}
            </div>
            <div>
              <strong>Date:</strong> {new Date(session.date).toLocaleDateString()}
            </div>
            <div>
              <strong>Time:</strong> {session.startTime} - {session.endTime}
            </div>
            <div>
              <strong>Trainer:</strong> {session.trainer?.user?.name ?? '-'}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <h3>Overall Rating</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setOverallRating(star)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '2rem',
                      cursor: 'pointer',
                      color: star <= overallRating ? '#f59e0b' : '#e2e8f0',
                      transition: 'color 0.15s',
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                {overallRating}/5
              </span>
            </div>
          </div>
        </div>

        {questions.length > 0 && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <h3>Questions</h3>
            </div>
            <div className="card-body">
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  style={{
                    marginBottom: index < questions.length - 1 ? '24px' : 0,
                    paddingBottom: index < questions.length - 1 ? '24px' : 0,
                    borderBottom:
                      index < questions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <p style={{ fontWeight: 500, marginBottom: '12px' }}>
                    {index + 1}. {question.question}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setAnswerRating(question.id, star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '1.5rem',
                          cursor: 'pointer',
                          color:
                            star <= (answers.get(question.id) ?? 3) ? '#f59e0b' : '#e2e8f0',
                          transition: 'color 0.15s',
                        }}
                      >
                        ★
                      </button>
                    ))}
                    <span style={{ marginLeft: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {answers.get(question.id) ?? 3}/5
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <h3>Additional Comments</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                placeholder="Share any additional feedback or suggestions (optional)..."
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </form>
    </div>
  );
}
