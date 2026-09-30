-- Rewrites repository-relative links (../src/..., ../../docs/...) to GitHub
-- URLs, so links still work in the rendered PDF and EPUB. The English
-- chapters sit in book/, the Russian ones in book/ru/: every leading ../
-- is dropped, so both resolve from the repository root.
local base = "https://github.com/oisee/osg-demo/blob/main/"
function Link(el)
  local t = el.target
  if t:match("^https?://") or t:match("^#") or t:match("^mailto:") then return el end
  t = t:gsub("^%./", "")
  while t:match("^%.%./") do t = t:gsub("^%.%./", "", 1) end
  el.target = base .. t
  return el
end
