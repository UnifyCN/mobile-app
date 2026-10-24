import { progressClient } from './progressClient';
import { sanityClient } from '@/sanity-custom';

interface CachedProgressData {
  [moduleId: string]: {
    [submoduleId: string]: {
      is_completed: boolean;
      progress_percent: number;
      completed_lessons: number;
      total_lessons: number;
      last_updated: string;
    };
  };
}

class CachedProgressService {
  private cache: CachedProgressData = {};
  private lastFetch: number = 0;
  private generation = 0;
  private accountEpoch = 0;
  private inFlight: Promise<CachedProgressData> | null = null;
  private cachedUserId: string | null = null;
  private readonly CACHE_DURATION = 30 * 1000; // 30 seconds - fast enough for screen transitions

  constructor() {
    // Clear cache on any auth state change (sign-in, sign-out, token refresh
    // with new user). Without this, account switches on shared/test devices
    // briefly show the previous user's lesson progress.
    progressClient.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (nextUserId !== this.cachedUserId) {
        this.accountEpoch += 1;
        this.cache = {};
        this.invalidate();
        this.cachedUserId = nextUserId;
      }
    });
  }

  async getProgressData(forceRefresh = false): Promise<CachedProgressData> {
    if (forceRefresh) this.invalidate();
    const now = Date.now();

    // Return cached data if it's fresh and not forcing refresh
    if (
      !forceRefresh &&
      now - this.lastFetch < this.CACHE_DURATION &&
      Object.keys(this.cache).length > 0
    ) {
      return this.cache;
    }

    // Share an active read across all screen consumers. Invalidation detaches
    // older work, so a subsequent read cannot reuse a pre-write response.
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    const request = this.fetchProgressData(generation, this.accountEpoch);
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) this.inFlight = null;
    }
  }

  private currentResult(
    generation: number,
    accountEpoch: number
  ): Promise<CachedProgressData> {
    // An old account must not receive the new account's cached data.
    if (accountEpoch !== this.accountEpoch) return Promise.resolve({});
    // Same-account readers follow the newer load instead of showing zeroes.
    if (generation !== this.generation) return this.getProgressData();
    return Promise.resolve(this.cache);
  }

  private async fetchProgressData(
    generation: number,
    accountEpoch: number
  ): Promise<CachedProgressData> {
    try {
      let user = null;
      try {
        const userResult = await progressClient.auth.getUser();
        user = userResult?.data?.user || null;
        if (userResult?.error) {
          const isSessionMissing =
            userResult.error?.name === 'AuthSessionMissingError' ||
            userResult.error?.message?.includes('Auth session missing');
          if (!isSessionMissing) {
            console.error(
              'Error getting user in cachedProgressService:',
              userResult.error
            );
          }
        }
      } catch (authError: any) {
        const isSessionMissing =
          authError?.name === 'AuthSessionMissingError' ||
          authError?.message?.includes('Auth session missing');
        if (!isSessionMissing) {
          console.error(
            'Exception getting user in cachedProgressService:',
            authError
          );
        }
        return this.currentResult(generation, accountEpoch); // Return stale cache on auth error
      }

      if (generation !== this.generation)
        return this.currentResult(generation, accountEpoch);

      if (!user) {
        return {};
      }

      // Belt-and-suspenders against a stale cache surviving an auth swap:
      // if the auth listener hasn't run yet (e.g., race during sign-in),
      // detect the user mismatch here and discard the previous user's data.
      if (this.cachedUserId !== user.id) {
        accountEpoch = ++this.accountEpoch;
        this.cache = {};
        this.lastFetch = 0;
      }
      this.cachedUserId = user.id;

      // The public catalog and account progress are independent reads.
      const sanityQuery = `*[_type == "module" && (language == "en" || !defined(language))] {
          _id,
          "submodules": *[_type == "submodule" && references(^._id) && (language == "en" || !defined(language))] | order(order) {
            _id,
            "lessons": *[_type == "lesson" && references(^._id) && (language == "en" || !defined(language))] | order(order) {
              _id
            }
          }
        }`;

      const [progressResult, modulesData] = await Promise.all([
        progressClient
          .from('user_lesson_progress')
          .select('*')
          .eq('user_id', user.id)
          .then(result => {
            if (result?.error) throw result.error;
            return result;
          }),
        sanityClient.fetch(sanityQuery),
      ]);
      const lessonProgresses = progressResult?.data || null;

      if (!modulesData || !Array.isArray(modulesData)) {
        console.error('Invalid Sanity data returned');
        return this.currentResult(generation, accountEpoch);
      }

      // Build progress data with actual lesson counts from Sanity
      const progressData: CachedProgressData = {};

      if (!Array.isArray(modulesData)) {
        console.error('Sanity returned non-array data');
        return this.currentResult(generation, accountEpoch);
      }

      modulesData.forEach((module: any) => {
        if (!module?._id) return;
        progressData[module._id] = {};

        if (!Array.isArray(module.submodules)) return;

        module.submodules.forEach((submodule: any) => {
          if (!submodule?._id) return;
          const totalLessons = submodule.lessons?.length || 0;

          const submoduleLessonRows: any[] = (lessonProgresses || []).filter(
            (lp: any) => lp.sanity_submodule_id === submodule._id
          );

          const completedLessons = submoduleLessonRows.filter(
            (lp: any) => lp.is_completed
          ).length;

          // Sum per-lesson progress_percent (0-100) so in-progress pages
          // contribute to the bar, not just fully-completed lessons.
          const sumPercent = (submodule.lessons || []).reduce(
            (acc: number, sanityLesson: any) => {
              const row = submoduleLessonRows.find(
                (lp: any) => lp.sanity_lesson_id === sanityLesson._id
              );
              return acc + (row?.progress_percent ?? 0);
            },
            0
          );

          const progressPercent =
            totalLessons > 0 ? Math.round(sumPercent / totalLessons) : 0;
          const isCompleted =
            completedLessons === totalLessons && totalLessons > 0;

          progressData[module._id][submodule._id] = {
            is_completed: isCompleted,
            progress_percent: progressPercent,
            completed_lessons: completedLessons,
            total_lessons: totalLessons,
            last_updated: new Date().toISOString(),
          };
        });
      });

      if (generation !== this.generation)
        return this.currentResult(generation, accountEpoch);
      this.cache = progressData;
      this.lastFetch = Date.now();

      return progressData;
    } catch (error) {
      console.error('Error fetching progress data:', error);
      return this.currentResult(generation, accountEpoch); // Return stale cache on error
    }
  }

  async getSubmoduleProgress(moduleId: string, submoduleId: string) {
    try {
      if (!moduleId || !submoduleId) {
        return {
          is_completed: false,
          progress_percent: 0,
          completed_lessons: 0,
          total_lessons: 0,
          last_updated: new Date().toISOString(),
        };
      }

      const progressData = await this.getProgressData();
      return (
        progressData[moduleId]?.[submoduleId] || {
          is_completed: false,
          progress_percent: 0,
          completed_lessons: 0,
          total_lessons: 0,
          last_updated: new Date().toISOString(),
        }
      );
    } catch (error: any) {
      console.error('Error in getSubmoduleProgress:', error);
      return {
        is_completed: false,
        progress_percent: 0,
        completed_lessons: 0,
        total_lessons: 0,
        last_updated: new Date().toISOString(),
      };
    }
  }

  async refreshProgress() {
    return this.getProgressData(true);
  }

  /** Immediately mark the cache as stale so the next read triggers a fresh fetch. */
  invalidate() {
    this.generation += 1;
    this.inFlight = null;
    this.lastFetch = 0;
  }

  // Call this when a lesson is completed to update the cache
  async updateProgressOnLessonCompletion(
    moduleId: string,
    submoduleId: string
  ) {
    // Force refresh to get latest data
    return this.getProgressData(true);
  }
}

export const cachedProgressService = new CachedProgressService();
