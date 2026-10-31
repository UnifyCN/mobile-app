#import <Foundation/Foundation.h>
#import <dispatch/dispatch.h>
#include <arpa/inet.h>
#include <errno.h>
#include <sys/socket.h>
#include <unistd.h>
#include "resolved-addresses.h"

int main(void) {
  @autoreleasepool {
    for (NSUInteger i = 0; i < sizeof(addresses)/sizeof(addresses[0]); i++) {
      BOOL v6 = strchr(addresses[i], ':') != NULL;
      int family = v6 ? AF_INET6 : AF_INET;
      int fd = socket(family, SOCK_STREAM, 0);
      struct sockaddr_storage storage = {0};
      socklen_t length;
      if (v6) {
        struct sockaddr_in6 *s = (void *)&storage;
        s->sin6_len = length = sizeof(*s); s->sin6_family = family;
        s->sin6_port = htons(443); inet_pton(family, addresses[i], &s->sin6_addr);
      } else {
        struct sockaddr_in *s = (void *)&storage;
        s->sin_len = length = sizeof(*s); s->sin_family = family;
        s->sin_port = htons(443); inet_pton(family, addresses[i], &s->sin_addr);
      }
      int rc = connect(fd, (void *)&storage, length), error = errno;
      close(fd);
      fprintf(stderr, "NATIVE369_SOCKET index=%lu rc=%d errno=%d\n", (unsigned long)i, rc, error);
      if (rc != -1 || (error != EPERM && error != EACCES)) return 103;
    }
    NSArray *urls = @[@"http://127.0.0.1:3396/", @"http://[::1]:3396/",
      @"https://wrbauxutkysljmsqojts.supabase.co/",
      @"https://us.i.posthog.com/", @"https://api.openai.com/",
      @"https://openrouter.ai/", @"https://1.1.1.1/",
      @"https://[2606:4700:4700::1111]/"];
    for (NSUInteger i = 0; i < urls.count; i++) {
      dispatch_semaphore_t done = dispatch_semaphore_create(0);
      NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
      config.timeoutIntervalForRequest = 4;
      NSURLSession *session = [NSURLSession sessionWithConfiguration:config];
      __block BOOL passed = NO;
      [[session dataTaskWithURL:[NSURL URLWithString:urls[i]] completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSInteger status = [response isKindOfClass:[NSHTTPURLResponse class]] ? ((NSHTTPURLResponse *)response).statusCode : 0;
        fprintf(stderr, "NATIVE369_NETWORK index=%lu status=%ld bytes=%lu domain=%s error=%ld\n", (unsigned long)i, (long)status, (unsigned long)data.length, error.domain.UTF8String ?: "", (long)error.code);
        BOOL denied = [error.domain isEqualToString:NSPOSIXErrorDomain] && error.code == EPERM;
        BOOL dnsBlocked = i >= 2 && i <= 5 && [error.domain isEqualToString:NSURLErrorDomain] && error.code == -1003;
        passed = i < 2 ? status == 200 && data.length > 0 : !response && data.length == 0 && (denied || dnsBlocked);
        dispatch_semaphore_signal(done);
      }] resume];
      if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 6*NSEC_PER_SEC)) || !passed) return 102;
      [session invalidateAndCancel];
    }
    fprintf(stderr, "NATIVE369_NETWORK_PASS\n");
  }
  return 0;
}
