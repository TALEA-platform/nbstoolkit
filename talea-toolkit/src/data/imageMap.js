const imageMap = {};
for (let i = 1; i <= 50; i++) {
  // Try common extensions
  const pngIds = [1,2,3,4,5,6,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,39,40,43];
  const ext = pngIds.includes(i) ? 'png' : 'jpg';
  imageMap[i] = `${process.env.PUBLIC_URL}/images/cs_${i}.${ext}`;
}

export default imageMap;
