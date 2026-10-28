export function roomAcceptsGender(room, gender, accommodationPolicy) {
  if (!gender) return false;
  if (accommodationPolicy === 'MALE_ONLY' && gender !== 'MALE') return false;
  if (accommodationPolicy === 'FEMALE_ONLY' && gender !== 'FEMALE') return false;
  return room.genderEligibility === 'ANY' || room.genderEligibility === gender;
}
