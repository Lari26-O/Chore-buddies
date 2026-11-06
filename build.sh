#!/bin/sh
# Rebuilds index.html (the page you host) from app.html.
cd "$(dirname "$0")"
{ printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Chore Buddies"><meta name="theme-color" content="#E9F6FF"><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-180.png"><link rel="icon" href="icon-192.png">\n'; cat app.html; printf '\n</html>\n'; } > index.html
