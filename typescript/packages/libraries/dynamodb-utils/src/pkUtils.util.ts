export const pkDelimiter: string = ':';

export function createDelimitedAttribute(keyPrefix: string, ...items: (string | number | boolean)[]): string {
	const escapedItems = items.map((i) => {
		if (typeof i === 'string') {
			return encodeURIComponent(i).toLowerCase();
		} else {
			return i;
		}
	});
	return `${delimitedAttributePrefix(keyPrefix)}${escapedItems.join(pkDelimiter)}`;
}

export function createDelimitedAttributePrefix(keyPrefix: string, ...items: (string | number | boolean)[]): string {
	let key = `${createDelimitedAttribute(keyPrefix, ...items)}`;
	if (!key.endsWith(pkDelimiter)) {
		key += pkDelimiter;
	}
	return key;
}

export function expandDelimitedAttribute(value: string): string[] {
	if (value === null || value === undefined) {
		return undefined;
	}
	const expanded = value.split(pkDelimiter);
	return expanded.map((i) => {
		if (typeof i === 'string') {
			return decodeURIComponent(i);
		} else {
			return i;
		}
	});
}

export function delimitedAttributePrefix(keyPrefix: string): string {
	return `${keyPrefix}${pkDelimiter}`;
}

export function isPkType(value: string, keyPrefix: string): boolean {
	return value.startsWith(delimitedAttributePrefix(keyPrefix));
}
