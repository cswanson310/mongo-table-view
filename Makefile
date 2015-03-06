# thanks Tyler (https://github.com/TylerBrock/mongo-hacker/blob/master/Makefile)

install:
	@echo "INSTALLATION"

	@if grep -q ".mongo-table-view\.js" ~/.mongorc.js ; \
	then \
	\
		echo "mongo-table-view already installed. Ending." ; \
		\
	else \
		echo "linking local index.js to ~/.mongo-table-view.js" ; \
		ln -sf "$(CURDIR)/index.js" ~/.mongo-table-view.js ; \
		echo "appending a load script to ~/.mongorc.js to load symlinked index file" ; \
		echo "var __CURDIR = '$(CURDIR)'; \nload(\"$(HOME)/.mongo-table-view.js\");" >> ~/.mongorc.js; \
	fi

check:
	@test -n "$$(which npm)" || \
	(echo "Need node package manager 'npm' to test mongo-views" && false)
	npm install
	npm test
