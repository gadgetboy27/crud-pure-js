import MaskedPattern from './pattern.js';
import IMask from '../core/holder.js';
import '../core/change-details.js';
import '../core/utils.js';
import './base.js';
import '../core/continuous-tail-details.js';
import './factory.js';
import './pattern/chunk-tail-details.js';
import './pattern/cursor.js';
import './pattern/fixed-definition.js';
import './pattern/input-definition.js';
import './regexp.js';

/** Pattern which validates enum values */
class MaskedEnum extends MaskedPattern {
  updateOptions(opts) {
    super.updateOptions(opts);
  }
  _update(opts) {
    const {
      enum: _enum,
      ...eopts
    } = opts;
    if (_enum) {
      eopts.mask = '*'.repeat(_enum[0].length);
      this.enum = _enum;
    }
    super._update(eopts);
  }
  doValidate(flags) {
    return this.enum.some(e => e.indexOf(this.unmaskedValue) >= 0) && super.doValidate(flags);
  }
}
IMask.MaskedEnum = MaskedEnum;

export { MaskedEnum as default };
