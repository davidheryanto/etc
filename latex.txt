# Configure bibtex for Texmaker
http://tex.sta\kexchange.com/questions/22725/configuring-texmaker-and-bibtex
http://decabyte.it/2013/03/latex-highlight-todo/

# Start new page
# http://tex.stackexchange.com/questions/45609/is-it-wrong-to-use-clearpage-instead-of-newpage
\clearpage  # Mostly use this, clear the float and new page in multicolumn
\newpage

# Packages
sudo yum -y install texlive-context-fullpage.noarch

# Set column gap in twocolumn
\setlength{\columnsep}{<width>}

# Center image in twocol
\begin{figure*}
	\center
 	\includegraphics[width=\textwidth]{AAA.eps}
 	\caption{PRF and pulses number comparison with eigenwaveform.}
 	\label{AAA}
\end{figure*}

# Reduce vertical spacing between lines
\vspace{-3mm}

# Author,year in citation
http://tex.stackexchange.com/questions/144764/author-year-citation-in-latex

# Side caption for figure
\usepackage{sidecap}
\begin{SCfigure}
  \caption{caption at the side}
  \includegraphics[width=0.5\textwidth]{image-name}
\end{SCfigure}

# Xelatex packages
sudo yum -y install texlive texlive-latex texlive-xetex texlive-collection-latex texlive-collection-latexrecommended texlive-xetex-def texlive-collection-xetex

\end{SCfigure}

# Reference with word 'fig' automatically added
\cref