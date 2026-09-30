-- Rewrites repository-relative links (../src/..., ../docs/...) to GitHub
-- URLs, so links still work in the rendered PDF and EPUB.
local base = "https://github.com/oisee/osg-demo/blob/main/"
function Link(el)
  local t = el.target
  if t:match("^https?://") or t:match("^#") or t:match("^mailto:") then return el end
  t = t:gsub("^%./", ""):gsub("^%.%./", "")
  el.target = base .. t
  return el
end
