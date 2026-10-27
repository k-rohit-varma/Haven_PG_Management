export default function Pagination({ page, pages, onPageChange, total, pageSize, onPageSizeChange, pageSizes = [12, 24, 48] }) {
  if (pages <= 1 && !onPageSizeChange) return null;
  return <div className="pagination">
    {onPageSizeChange && <label className="pagination-size">Rows <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{pageSizes.map((size) => <option value={size} key={size}>{size}</option>)}</select></label>}
    {total !== undefined && <span>{total} total</span>}
    <button disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
    <span>Page {page} of {Math.max(1, pages)}</span>
    <button disabled={page >= pages} onClick={() => onPageChange(Math.min(pages, page + 1))}>Next</button>
  </div>;
}
