import { getAllEvents } from '@/services/events/getAllEvents';
import { useQuery } from '@tanstack/react-query';

export const useEvents = () => {
  return useQuery({
    queryKey: ['events'],
    queryFn: () => getAllEvents(),
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};
