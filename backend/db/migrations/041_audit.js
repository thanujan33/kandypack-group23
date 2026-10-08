// This migration generates ordinary MySQL triggers from fixed column lists.
// No browser-provided identifiers enter these SQL strings.
export async function up(c){
  await c.query(`CREATE TABLE audit_log(
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    actor_id INT NULL,changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    entity VARCHAR(40) NOT NULL,action VARCHAR(10) NOT NULL,
    old_values JSON NULL,new_values JSON NULL,
    INDEX ix_audit_entity_time(entity,changed_at)
  ) ENGINE=InnoDB`);
  const tables={
    orders:['id','customer_id','route_id','placed_at','delivery_date','address','instructions','status','delivered_at'],
    order_items:['order_id','product_id','quantity','unit_price','space_rate','line_total'],
    train_trips:['id','reference','store_id','departure_at','arrival_at','capacity','status'],
    train_allocations:['id','train_trip_id','order_id','product_id','quantity','space_rate','received_qty','receipt_checked','received_at'],
    delivery_trips:['id','route_id','truck_id','driver_id','assistant_id','planned_start','planned_end','actual_start','actual_end','status'],
    delivery_trip_orders:['trip_id','order_id','outcome'],
    employees:['id','store_id','role','name','nic','phone','email','active']
  };
  for(const [table,columns] of Object.entries(tables)){
    const json=prefix=>'JSON_OBJECT('+columns.map(k=>`'${k}',${prefix}.${k}`).join(',')+')';
    for(const action of ['INSERT','UPDATE','DELETE']){
      const old=action==='INSERT'?'NULL':json('OLD');
      const next=action==='DELETE'?'NULL':json('NEW');
      await c.query(`CREATE TRIGGER audit_${table}_${action.toLowerCase()}
        AFTER ${action} ON ${table} FOR EACH ROW
        INSERT INTO audit_log(actor_id,entity,action,old_values,new_values)
        VALUES(@actor,'${table}','${action}',${old},${next})`);
    }
  }
  for(const action of ['UPDATE','DELETE']) await c.query(
    `CREATE TRIGGER audit_no_${action.toLowerCase()} BEFORE ${action} ON audit_log
     FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are append only'`);
}
