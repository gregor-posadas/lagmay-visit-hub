# Step 1. Building centroids (bbox centres) from Google Open Buildings (PHL_buildings.parquet), saved as float32 arrays.
# Run on the computer that holds "Nationwide Update" (about 30 s, 40.7 million buildings).
import os, numpy as np, pyarrow.parquet as pq, time
f = pq.ParquetFile(os.path.expanduser('~/mnt/Nationwide Update/PHL_buildings.parquet'))
n = f.metadata.num_rows
lon = np.empty(n, np.float32); lat = np.empty(n, np.float32); i = 0; t = time.time()
for g in range(f.metadata.num_row_groups):
    b = f.read_row_group(g, columns=['bbox']).column('bbox').combine_chunks()
    x0 = b.field('xmin').to_numpy(); x1 = b.field('xmax').to_numpy(); y0 = b.field('ymin').to_numpy(); y1 = b.field('ymax').to_numpy()
    k = len(x0); lon[i:i+k] = (x0 + x1) / 2; lat[i:i+k] = (y0 + y1) / 2; i += k
    if g % 500 == 0: print(g, i, round(time.time() - t), flush=True)
np.save('lon.npy', lon[:i]); np.save('lat.npy', lat[:i]); print('done', i, round(time.time() - t), flush=True)
