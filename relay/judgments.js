export function isFc(judgments) {
	if (!judgments || typeof judgments !== 'object') return false;
	if ((judgments.Failed ?? 0) !== 0) return false;
	const total = Object.values(judgments).reduce((a, b) => a + b, 0);
	return total > 0;
}

export function isPfc(judgments) {
	if (!judgments || typeof judgments !== 'object') return false;
	if ((judgments.PerfectPlus ?? 0) === 0) return false;
	const others = ['Perfect', 'Great', 'Good', 'OK', 'Bad', 'Failed'];
	return others.every(k => (judgments[k] ?? 0) === 0);
}
