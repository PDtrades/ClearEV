/** US states, DC, and territories keyed by USPS abbreviation. `supported` = in ClearEV's search scope. */
export interface StateInfo {
  abbr: string;
  fips: string;
  name: string;
  supported: boolean;
}

const RAW: [string, string, string][] = [
  ["AL", "01", "Alabama"], ["AK", "02", "Alaska"], ["AZ", "04", "Arizona"], ["AR", "05", "Arkansas"],
  ["CA", "06", "California"], ["CO", "08", "Colorado"], ["CT", "09", "Connecticut"], ["DE", "10", "Delaware"],
  ["DC", "11", "District of Columbia"], ["FL", "12", "Florida"], ["GA", "13", "Georgia"], ["HI", "15", "Hawaii"],
  ["ID", "16", "Idaho"], ["IL", "17", "Illinois"], ["IN", "18", "Indiana"], ["IA", "19", "Iowa"],
  ["KS", "20", "Kansas"], ["KY", "21", "Kentucky"], ["LA", "22", "Louisiana"], ["ME", "23", "Maine"],
  ["MD", "24", "Maryland"], ["MA", "25", "Massachusetts"], ["MI", "26", "Michigan"], ["MN", "27", "Minnesota"],
  ["MS", "28", "Mississippi"], ["MO", "29", "Missouri"], ["MT", "30", "Montana"], ["NE", "31", "Nebraska"],
  ["NV", "32", "Nevada"], ["NH", "33", "New Hampshire"], ["NJ", "34", "New Jersey"], ["NM", "35", "New Mexico"],
  ["NY", "36", "New York"], ["NC", "37", "North Carolina"], ["ND", "38", "North Dakota"], ["OH", "39", "Ohio"],
  ["OK", "40", "Oklahoma"], ["OR", "41", "Oregon"], ["PA", "42", "Pennsylvania"], ["RI", "44", "Rhode Island"],
  ["SC", "45", "South Carolina"], ["SD", "46", "South Dakota"], ["TN", "47", "Tennessee"], ["TX", "48", "Texas"],
  ["UT", "49", "Utah"], ["VT", "50", "Vermont"], ["VA", "51", "Virginia"], ["WA", "53", "Washington"],
  ["WV", "54", "West Virginia"], ["WI", "55", "Wisconsin"], ["WY", "56", "Wyoming"],
];
const TERRITORIES: [string, string, string][] = [
  ["AS", "60", "American Samoa"], ["GU", "66", "Guam"], ["MP", "69", "Northern Mariana Islands"],
  ["PR", "72", "Puerto Rico"], ["VI", "78", "U.S. Virgin Islands"],
];

export const STATES: StateInfo[] = [
  ...RAW.map(([abbr, fips, name]) => ({ abbr, fips, name, supported: true })),
  ...TERRITORIES.map(([abbr, fips, name]) => ({ abbr, fips, name, supported: false })),
];

export const SUPPORTED_STATES = STATES.filter((s) => s.supported);
const BY_ABBR = new Map(STATES.map((s) => [s.abbr, s]));
const BY_FIPS = new Map(STATES.map((s) => [s.fips, s]));

export function stateByAbbr(abbr: string | null | undefined): StateInfo | undefined {
  return abbr ? BY_ABBR.get(abbr.toUpperCase()) : undefined;
}
export function stateByFips(fips: string): StateInfo | undefined {
  return BY_FIPS.get(fips);
}
export function isSupportedState(abbr: string | null | undefined): boolean {
  return !!stateByAbbr(abbr)?.supported;
}
