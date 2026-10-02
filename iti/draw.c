#include <stdio.h>
int mandel(int cx, int cy, int max);
int main(void) {
  const char *ramp = " .:-=+*#%@";
  int cols = 64, rows = 24, max = 32, sum = 0;
  for (int r = 0; r < rows; r++) {
    int cy = -81920 + r * 163840 / (rows - 1);
    for (int c = 0; c < cols; c++) {
      int cx = -131072 + c * 163840 / (cols - 1);
      int n = mandel(cx, cy, max);
      sum = (sum + n) % 1000000;
      putchar(ramp[n >= max ? 9 : n * 9 / max]);
    }
    putchar('\n');
  }
  printf("Iterations: %d\n", sum);
  return 0;
}
