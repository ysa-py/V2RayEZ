CC = gcc
CFLAGS = -I. -Wall -Wextra
# Adjust LIB path to match cargo target directory after build
LIB = ../target/debug/libv2rayez_universal_core.a
LDFLAGS = $(LIB) -lpthread -ldl
.PHONY: all test clean
all: test_ffi
test_ffi: test_ffi.c v2rayez_core.h
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)
test: test_ffi
	./test_ffi
clean:
	rm -f test_ffi
