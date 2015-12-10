For x11 compile error
https://www.linuxquestions.org/questions/linux-from-scratch-13/blfs-sdl-4175466360/

To get a clean compile, edit ./src/video/x11/SDL_x11sym.h around line 166 so it looks like this:

#if 0
#ifdef LONG64
SDL_X11_MODULE(IO_32BIT)
SDL_X11_SYM(int,_XData32,(Display *dpy,register long *data,unsigned len),(dpy,data,len),return)
SDL_X11_SYM(void,_XRead32,(Display *dpy,register long *data,long len),(dpy,data,len),)
#endif
#endif