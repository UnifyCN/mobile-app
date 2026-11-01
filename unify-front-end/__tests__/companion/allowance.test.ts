import { getChatbotUsage } from '@/services/companion/getChatbotUsage';
import { ownAccountWork, subscribeAccount } from '@/services/account/accountSession';
const mockRpc = jest.fn();
let mockUser = 'allowance-a';
let mockAuthError: Error | null = null;
let mockListener: (event: string, session: unknown) => void = () => {};
jest.mock('@/lib/supabase', () => ({ supabase: {
  rpc: (...args: unknown[]) => mockRpc(...args),
  auth: {
    getUser: async () => ({ data: { user: { id: mockUser } }, error: mockAuthError }),
    getSession: async () => ({ data: { session: { user: { id: mockUser } } } }),
    onAuthStateChange: (listener: typeof mockListener) => { mockListener=listener; return { data: { subscription: { unsubscribe: () => {} } } }; },
  },
} }));
let stop: () => void;
beforeEach(async () => {
  mockUser='allowance-a'; mockAuthError=null; mockRpc.mockReset();
  stop=subscribeAccount(() => {}); await Promise.resolve();
  mockListener('SIGNED_IN',{user:{id:mockUser}});
});
afterEach(() => stop());
it('uses server UTC metadata without changing the day or remaining allowance', async () => {
  const expected={message_count:5,daily_limit:6,remaining:1,is_premium:false,last_message_at:null,resets_at:'2026-11-02T00:00:00Z',observed_at:'2026-11-01T23:59:59Z'};
  mockRpc.mockResolvedValue({data:expected,error:null});
  expect(await getChatbotUsage()).toEqual(expected);
  expect(mockRpc).toHaveBeenCalledWith('get_chatbot_allowance');
});
it('rejects auth, network and malformed responses instead of granting a new allowance', async () => {
  mockAuthError=Error('auth unavailable'); await expect(getChatbotUsage()).rejects.toThrow('auth unavailable');
  mockAuthError=null; mockRpc.mockResolvedValue({data:null,error:Error('offline')});
  await expect(getChatbotUsage()).rejects.toThrow('offline');
  mockRpc.mockResolvedValue({data:{message_count:0},error:null});
  await expect(getChatbotUsage()).rejects.toThrow('Invalid server allowance');
});
it('rejects a prior account response after an account replacement', async () => {
  const owner=ownAccountWork();
  mockRpc.mockImplementation(async () => {mockUser='allowance-b';mockListener('SIGNED_IN',{user:{id:mockUser}});return {data:{},error:null};});
  await expect(getChatbotUsage(owner)).rejects.toThrow('account');
});
