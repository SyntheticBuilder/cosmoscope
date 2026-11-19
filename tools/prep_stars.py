import csv, struct, json, sys
src, outbin, outnames = sys.argv[1:4]
rows=[]; names=[]
with open(src) as f:
    for r in csv.DictReader(f):
        if r['proper']=='Sol': continue
        try:
            d=float(r['dist'])
        except: continue
        if d<=0 or d>=100000: continue
        def g(k,default=0.0):
            try: return float(r[k])
            except: return default
        rows.append((g('x'),g('y'),g('z'),g('vx'),g('vy'),g('vz'),g('absmag',5.0),g('ci',0.65)))
        if r['proper']:
            names.append([len(rows)-1, r['proper'], round(d*3.26156,2), r['spect']])
with open(outbin,'wb') as f:
    for t in rows: f.write(struct.pack('<8f',*t))
json.dump(names,open(outnames,'w'),separators=(',',':'))
print(len(rows),'stars',len(names),'named')
