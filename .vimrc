set tabstop=4
set shiftwidth=4
set autoindent
set expandtab
:syntax enable
set pastetoggle=<F12>
:color desert
if has("autocmd")
au BufReadPost * if line("'\"") > 0 && line("'\"") <= line("$") | exe "normal! g`\"" | endif
endif
