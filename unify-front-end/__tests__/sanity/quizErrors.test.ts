jest.mock('../../sanity-custom', () => ({ sanityClient: { fetch: jest.fn() } }));
import { sanityClient } from '../../sanity-custom';
import { getLessonQuizzes, getQuizQuestions } from '../../services/sanity/quizzes';

describe('quiz read failures', () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  afterAll(() => log.mockRestore());
  test('rejects a failed list read instead of making the lesson skip its quiz', async () => {
    (sanityClient.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(getLessonQuizzes('lesson')).rejects.toThrow('offline');
  });
  test('rejects a failed question read', async () => {
    (sanityClient.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(getQuizQuestions('quiz')).rejects.toThrow('offline');
  });
  test('still accepts a successful empty list', async () => {
    (sanityClient.fetch as jest.Mock).mockResolvedValueOnce([]);
    await expect(getLessonQuizzes('lesson')).resolves.toEqual([]);
  });
});
