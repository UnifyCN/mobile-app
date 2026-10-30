#include <mach-o/dyld.h>
#include <string.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <errno.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/time.h>
__attribute__((constructor)) static void guard(void){
 char location[4096]; uint32_t cap=sizeof(location); if(_NSGetExecutablePath(location,&cap))_exit(90); char *slash=strrchr(location,'/'); if(!slash)_exit(90); strcpy(slash+1,"local-only.bytecode"); const char *path=location;
 FILE *f=fopen(path,"rb");if(!f)_exit(91);fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);void *data=malloc(n);if(fread(data,1,n,f)!=n)_exit(92);fclose(f);
 int (*apply)(const void*,size_t,const char*)=dlsym(RTLD_DEFAULT,"sandbox_apply_bytecode");if(!apply)_exit(93);
 int r=apply(data,n,NULL);fprintf(stderr,"IOS359_APP_GUARD_APPLY rc=%d errno=%d pid=%d\n",r,errno,getpid());fflush(stderr);if(r)_exit(94);
 int families[]={AF_INET,AF_INET6};
 for(int i=0;i<2;i++){
  int fd=socket(families[i],SOCK_STREAM,0);struct timeval t={.tv_sec=3};setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&t,sizeof(t));
  struct sockaddr_storage s={0};socklen_t size;
  if(i==0){struct sockaddr_in *a=(void*)&s;a->sin_len=size=sizeof(*a);a->sin_family=AF_INET;a->sin_port=htons(443);inet_pton(AF_INET,"1.1.1.1",&a->sin_addr);}
  else{struct sockaddr_in6 *a=(void*)&s;a->sin6_len=size=sizeof(*a);a->sin6_family=AF_INET6;a->sin6_port=htons(443);inet_pton(AF_INET6,"2606:4700:4700::1111",&a->sin6_addr);}
  r=connect(fd,(void*)&s,size);int e=errno;close(fd);fprintf(stderr,"IOS359_APP_GUARD family=%d rc=%d errno=%d pid=%d\n",families[i],r,e,getpid());fflush(stderr);
  if(r!=-1||(e!=EPERM&&e!=EACCES))_exit(95);
 }
 fprintf(stderr,"IOS359_APP_GUARD_READY pid=%d\n",getpid());fflush(stderr);
}
