/* Iterations of z = z*z + c at one point, in 16.16 fixed point, at most max. */
int mandel(int cx, int cy, int max) {
  int x = 0, y = 0, i = 0;
  while (i < max) {
    long long xx = (long long)x * x >> 16, yy = (long long)y * y >> 16;
    if (xx + yy > (4 << 16)) break;
    int xy = (int)((long long)x * y >> 16);
    x = (int)(xx - yy) + cx;
    y = 2 * xy + cy;
    i++;
  }
  return i;
}
